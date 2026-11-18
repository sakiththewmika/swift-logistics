import asyncio
import importlib
import importlib.util
import json
import os
import sys
import tempfile
import time
import types
import unittest
from unittest.mock import AsyncMock


SERVICE_PATH = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, SERVICE_PATH)


def _missing(name):
    if name in sys.modules:
        return False
    try:
        return importlib.util.find_spec(name) is None
    except (ValueError, ImportError):
        return True


def install_missing_dependency_stubs():
    if _missing("pika"):
        pika = types.ModuleType("pika")

        class BasicProperties:
            def __init__(self, **kwargs):
                self.__dict__.update(kwargs)

        class URLParameters:
            def __init__(self, uri):
                self.uri = uri

        class BlockingConnection:
            def __init__(self, *args, **kwargs):
                raise RuntimeError("RabbitMQ is unavailable in unit tests")

        pika.BasicProperties = BasicProperties
        pika.URLParameters = URLParameters
        pika.BlockingConnection = BlockingConnection
        pika.exceptions = types.SimpleNamespace(AMQPConnectionError=Exception)
        sys.modules["pika"] = pika

    if _missing("httpx"):
        httpx = types.ModuleType("httpx")
        httpx.HTTPError = Exception
        httpx.TransportError = Exception
        sys.modules["httpx"] = httpx

    if _missing("motor"):
        motor = types.ModuleType("motor")
        motor_asyncio = types.ModuleType("motor.motor_asyncio")

        class AsyncIOMotorClient:
            def __init__(self, *args, **kwargs):
                pass

            def __getitem__(self, key):
                return self

            def __getattr__(self, name):
                return self

            async def find_one(self, *args, **kwargs):
                return None

        motor_asyncio.AsyncIOMotorClient = AsyncIOMotorClient
        motor.motor_asyncio = motor_asyncio
        sys.modules["motor"] = motor
        sys.modules["motor.motor_asyncio"] = motor_asyncio


class ConsumerFixture(unittest.TestCase):
    """Imports consumer.py against a scratch database; holds no tests itself."""

    @classmethod
    def setUpClass(cls):
        cls.database = tempfile.NamedTemporaryFile(delete=False)
        cls.database.close()
        os.environ["DEDUP_DB_PATH"] = cls.database.name
        install_missing_dependency_stubs()
        sys.modules.pop("consumer", None)
        cls.consumer = importlib.import_module("consumer")

    @classmethod
    def tearDownClass(cls):
        cls.consumer.dedup_connection.close()
        os.unlink(cls.database.name)

    PATCHED_NAMES = ("process_message", "call_ros_with_fallback", "emit_zipkin_span", "ros_breaker")

    def setUp(self):
        self.consumer.dedup_connection.execute("DELETE FROM processed_orders")
        self.consumer.dedup_connection.commit()
        # Tests replace module attributes; put the originals back so tests cannot affect each other.
        self._saved = {name: getattr(self.consumer, name) for name in self.PATCHED_NAMES}
        self._saved_find_one = self.consumer.drivers_collection.find_one

    def tearDown(self):
        for name, value in self._saved.items():
            setattr(self.consumer, name, value)
        self.consumer.drivers_collection.find_one = self._saved_find_one


class RosConsumerTests(ConsumerFixture):
    def test_dedup_first_duplicate_and_release(self):
        self.assertTrue(self.consumer.acquire_dedup("order-1:ROS_ROUTING"))
        self.assertFalse(self.consumer.acquire_dedup("order-1:ROS_ROUTING"))
        self.consumer.release_dedup("order-1")
        self.assertTrue(self.consumer.acquire_dedup("order-1:ROS_ROUTING"))

    def test_cleanup_removes_expired_records(self):
        self.consumer.dedup_connection.execute(
            "INSERT INTO processed_orders (dedup_key, status, created_at) VALUES (?, ?, ?)",
            ("old:ROS_ROUTING", "COMPLETED", 1),
        )
        self.consumer.dedup_connection.commit()

        self.consumer.cleanup_expired_dedup_records(retention_seconds=60)

        row = self.consumer.dedup_connection.execute(
            "SELECT 1 FROM processed_orders WHERE dedup_key = ?",
            ("old:ROS_ROUTING",),
        ).fetchone()
        self.assertIsNone(row)

    def test_process_message_preserves_trace_headers(self):
        consumer = self.consumer
        consumer.acquire_dedup("order-2:ROS_ROUTING")
        consumer.release_dedup("order-2")
        consumer.drivers_collection.find_one = AsyncMock(
            return_value={"_id": "driver-1", "vehicleId": "vehicle-1"}
        )
        consumer.call_ros_with_fallback = AsyncMock(
            return_value={"waypoints": ["A", "B"]}
        )
        consumer.emit_zipkin_span = lambda *args, **kwargs: (
            "00-" + "c" * 32 + "-" + "d" * 16 + "-01"
        )
        published = {}

        class Channel:
            def basic_publish(self, **kwargs):
                published.update(kwargs)

            def basic_ack(self, **kwargs):
                published["acked"] = kwargs

        method = types.SimpleNamespace(delivery_tag=7)
        properties = types.SimpleNamespace(
            correlation_id="corr-2",
            headers={
                "X-Correlation-Id": "corr-2",
                "traceparent": "00-" + "a" * 32 + "-" + "b" * 16 + "-01",
            },
        )
        body = '{"orderId":"order-2","deliveryAddress":"A","city":"Colombo"}'

        asyncio.run(consumer.process_message(Channel(), method, properties, body))

        self.assertEqual(
            published["properties"].headers["X-Correlation-Id"], "corr-2"
        )
        self.assertEqual(
            published["properties"].headers["traceparent"],
            "00-" + "c" * 32 + "-" + "d" * 16 + "-01",
        )
        self.assertIn("acked", published)


class StopLoop(BaseException):
    """Raised by a patched sleep to break out of the consumer's endless loop."""


class RosResilienceTests(ConsumerFixture):

    def setUp(self):
        super().setUp()
        self.consumer.ros_breaker = self.consumer.RosCircuitBreaker()
        os.environ.pop("ENABLE_CHAOS_HOOKS", None)

    def tearDown(self):
        os.environ.pop("ENABLE_CHAOS_HOOKS", None)
        super().tearDown()

    # ----- circuit breaker -----

    def test_is_open_has_no_side_effects(self):
        breaker = self.consumer.RosCircuitBreaker(failure_threshold=2, open_seconds=30)
        self.assertFalse(breaker.is_open())
        breaker.record_failure()
        breaker.record_failure()
        self.assertTrue(breaker.is_open())

        breaker.opened_at -= 31  # the open window has elapsed
        self.assertFalse(breaker.is_open())
        self.assertFalse(breaker._half_open_probe)
        # The probe is still available for a real request.
        self.assertTrue(breaker.allow_call())
        self.assertFalse(breaker.allow_call())

    def test_idle_tick_does_not_wedge_the_breaker(self):
        consumer = self.consumer
        consumer.ros_breaker.failures = consumer.ros_breaker.failure_threshold
        consumer.ros_breaker.opened_at = consumer.monotonic() - consumer.ros_breaker.open_seconds - 1
        channel = FakeChannel(events=[(None, None, None)], then=StopLoop())
        connection = FakeConnection(channel)

        with self.patched_broker(connection):
            with self.assertRaises(StopLoop):
                asyncio.run(consumer.start_consumer())

        self.assertFalse(consumer.ros_breaker._half_open_probe)
        self.assertTrue(consumer.ros_breaker.allow_call())  # a real request can still probe ROS
        self.assertTrue(connection.closed)

    def test_open_circuit_pauses_consumption_on_idle_tick(self):
        consumer = self.consumer
        for _ in range(consumer.ros_breaker.failure_threshold):
            consumer.ros_breaker.record_failure()
        channel = FakeChannel(events=[(None, None, None)], then=StopLoop())
        connection = FakeConnection(channel)
        sleeps = []

        with self.patched_broker(connection, sleeps):
            with self.assertRaises(StopLoop):
                asyncio.run(consumer.start_consumer())

        self.assertTrue(channel.cancelled)
        self.assertTrue(sleeps and sleeps[0] <= 5)
        self.assertTrue(connection.closed)

    # ----- circuit open must never fail (and refund) an order -----

    def test_process_message_reraises_circuit_open_without_publishing(self):
        consumer = self.consumer
        consumer.drivers_collection.find_one = AsyncMock(return_value={"_id": "d1", "vehicleId": "v1"})
        consumer.call_ros_with_fallback = AsyncMock(side_effect=consumer.CircuitOpenError("open"))
        channel = RecordingChannel()
        body = '{"orderId":"order-open","deliveryAddress":"A","city":"Colombo"}'

        with self.assertRaises(consumer.CircuitOpenError):
            asyncio.run(consumer.process_message(
                channel, types.SimpleNamespace(delivery_tag=1), types.SimpleNamespace(correlation_id=None, headers={}), body))

        self.assertEqual(channel.published, [])
        self.assertEqual(channel.acked, [])

    def test_consumer_requeues_the_message_when_the_circuit_is_open(self):
        consumer = self.consumer
        consumer.process_message = AsyncMock(side_effect=consumer.CircuitOpenError("open"))
        body = b'{"orderId":"order-open"}'
        channel = FakeChannel(events=[(types.SimpleNamespace(delivery_tag=9), None, body)], then=StopLoop())
        connection = FakeConnection(channel)

        with self.patched_broker(connection):
            with self.assertRaises(StopLoop):
                asyncio.run(consumer.start_consumer())

        self.assertEqual(channel.nacks, [(9, True)])
        self.assertTrue(channel.cancelled)
        self.assertTrue(connection.closed)

    def test_other_processing_errors_are_dead_lettered(self):
        consumer = self.consumer
        consumer.process_message = AsyncMock(side_effect=ValueError("bad payload"))
        channel = FakeChannel(
            events=[(types.SimpleNamespace(delivery_tag=3), None, b'{"orderId":"order-bad"}'), (None, None, None)],
            then=StopLoop())
        connection = FakeConnection(channel)

        with self.patched_broker(connection):
            with self.assertRaises(StopLoop):
                asyncio.run(consumer.start_consumer())

        self.assertEqual(channel.nacks[0], (3, False))

    # ----- consumer loop survives failures and never leaks connections -----

    def test_loop_survives_unexpected_errors_and_closes_every_connection(self):
        consumer = self.consumer
        connections = []

        class BrokenChannel(FakeChannel):
            def queue_declare(self, **kwargs):
                raise RuntimeError("channel closed by broker")

        def factory(*_args, **_kwargs):
            connection = FakeConnection(BrokenChannel(events=[], then=StopLoop()))
            connections.append(connection)
            return connection

        sleeps = []

        async def fake_sleep(seconds):
            sleeps.append(seconds)
            if len(sleeps) >= 2:
                raise StopLoop()

        original_sleep = consumer.asyncio.sleep
        original_connection = consumer.pika.BlockingConnection
        consumer.asyncio.sleep = fake_sleep
        consumer.pika.BlockingConnection = factory
        try:
            with self.assertRaises(StopLoop):
                asyncio.run(consumer.start_consumer())
        finally:
            consumer.asyncio.sleep = original_sleep
            consumer.pika.BlockingConnection = original_connection

        self.assertGreaterEqual(len(connections), 2)  # it reconnected instead of dying
        self.assertTrue(all(c.closed for c in connections))
        self.assertEqual(sleeps[0], 5)

    # ----- chaos hook is configurable -----

    def _run_with_address(self, address, order_id):
        consumer = self.consumer
        consumer.drivers_collection.find_one = AsyncMock(return_value={"_id": "d1", "vehicleId": "v1"})
        consumer.call_ros_with_fallback = AsyncMock(return_value={"waypoints": ["A", "B"]})
        consumer.emit_zipkin_span = lambda *a, **k: "00-" + "c" * 32 + "-" + "d" * 16 + "-01"
        channel = RecordingChannel()
        body = '{"orderId":"%s","deliveryAddress":"%s","city":"Colombo"}' % (order_id, address)
        asyncio.run(consumer.process_message(
            channel, types.SimpleNamespace(delivery_tag=1), types.SimpleNamespace(correlation_id=None, headers={}), body))
        return json.loads(channel.published[0]["body"])["status"]

    def test_fail_route_hook_is_on_by_default(self):
        self.assertEqual(self._run_with_address("99 Galle Road [FAIL_ROUTE]", "chaos-on"), "FAILED")

    def test_fail_route_hook_can_be_disabled(self):
        os.environ["ENABLE_CHAOS_HOOKS"] = "false"
        self.assertEqual(self._run_with_address("99 Galle Road [FAIL_ROUTE]", "chaos-off"), "ROUTED")

    # ----- stale dedup rows -----

    def _seed(self, key, status, age_seconds):
        self.consumer.dedup_connection.execute(
            "INSERT INTO processed_orders (dedup_key, status, created_at) VALUES (?, ?, ?)",
            (key, status, int(time.time()) - age_seconds))
        self.consumer.dedup_connection.commit()

    def test_stale_processing_row_is_reclaimed(self):
        self._seed("crashed:ROS_ROUTING", "PROCESSING", 120)
        self.assertTrue(self.consumer.acquire_dedup("crashed:ROS_ROUTING"))
        # ...and it is now owned by the new attempt, so a further redelivery is a duplicate.
        self.assertFalse(self.consumer.acquire_dedup("crashed:ROS_ROUTING"))

    def test_recent_processing_and_completed_rows_are_still_duplicates(self):
        self._seed("busy:ROS_ROUTING", "PROCESSING", 5)
        self._seed("done:ROS_ROUTING", "COMPLETED", 3600)
        self.assertFalse(self.consumer.acquire_dedup("busy:ROS_ROUTING"))
        self.assertFalse(self.consumer.acquire_dedup("done:ROS_ROUTING"))

    # ----- helpers -----

    def patched_broker(self, connection, sleeps=None):
        consumer = self.consumer
        test = self

        class Ctx:
            def __enter__(ctx):
                ctx.sleep = consumer.asyncio.sleep
                ctx.conn = consumer.pika.BlockingConnection
                ctx.process = consumer.process_message

                async def fake_sleep(seconds):
                    if sleeps is not None:
                        sleeps.append(seconds)
                    return None

                consumer.asyncio.sleep = fake_sleep
                consumer.pika.BlockingConnection = lambda *a, **k: connection

            def __exit__(ctx, *exc):
                consumer.asyncio.sleep = ctx.sleep
                consumer.pika.BlockingConnection = ctx.conn
                return False

        return Ctx()


class FakeChannel:
    def __init__(self, events, then):
        self.events = list(events)
        self.then = then
        self.nacks = []
        self.cancelled = False

    def queue_declare(self, **kwargs):
        return None

    def consume(self, queue, inactivity_timeout=None):
        # Events are delivered once; a reconnect finds the queue empty and ends the test.
        while self.events:
            yield self.events.pop(0)
        raise self.then

    def basic_nack(self, delivery_tag, requeue):
        self.nacks.append((delivery_tag, requeue))

    def basic_ack(self, delivery_tag):
        pass

    def cancel(self):
        self.cancelled = True


class FakeConnection:
    def __init__(self, channel):
        self._channel = channel
        self.is_open = True
        self.closed = False

    def channel(self):
        return self._channel

    def close(self):
        self.closed = True
        self.is_open = False


class RecordingChannel:
    def __init__(self):
        self.published = []
        self.acked = []

    def basic_publish(self, **kwargs):
        self.published.append(kwargs)

    def basic_ack(self, **kwargs):
        self.acked.append(kwargs)


if __name__ == "__main__":
    unittest.main()
