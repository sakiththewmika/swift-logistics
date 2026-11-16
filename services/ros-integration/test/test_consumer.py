import asyncio
import importlib
import os
import sys
import tempfile
import types
import unittest
from unittest.mock import AsyncMock


SERVICE_PATH = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, SERVICE_PATH)


class RosConsumerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.database = tempfile.NamedTemporaryFile(delete=False)
        cls.database.close()
        os.environ["DEDUP_DB_PATH"] = cls.database.name
        sys.modules.pop("consumer", None)
        cls.consumer = importlib.import_module("consumer")

    @classmethod
    def tearDownClass(cls):
        cls.consumer.dedup_connection.close()
        os.unlink(cls.database.name)

    def setUp(self):
        self.consumer.dedup_connection.execute("DELETE FROM processed_orders")
        self.consumer.dedup_connection.commit()

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


if __name__ == "__main__":
    unittest.main()
