import sys
import os
import threading
import time
import types
import json
import unittest
from unittest.mock import MagicMock, patch

os.environ.setdefault('DEDUP_DB_PATH', ':memory:')


APP_PATH = __file__.split('/services/wms-adapter/')[0] + '/services/wms-adapter/app'


def install_stub_pika(channel_mock: MagicMock, connection_mock: MagicMock):
    mod = types.ModuleType('pika')

    class BasicProperties:
        def __init__(self, delivery_mode=None, **kwargs):
            self.delivery_mode = delivery_mode
            self.message_id = kwargs.get('message_id')
            self.correlation_id = kwargs.get('correlation_id')
            self.headers = kwargs.get('headers', {})

    class PlainCredentials:
        def __init__(self, username, password):
            self.username = username
            self.password = password

    class ConnectionParameters:
        def __init__(self, host, port, credentials):
            self.host = host
            self.port = port
            self.credentials = credentials

    def BlockingConnection(params):
        return connection_mock

    # Attach symbols
    mod.BasicProperties = BasicProperties
    mod.PlainCredentials = PlainCredentials
    mod.ConnectionParameters = ConnectionParameters
    mod.BlockingConnection = BlockingConnection

    sys.modules['pika'] = mod


def import_client_module():
    # Force-load the client module from file path
    if 'rabbitmq.client' in sys.modules:
        del sys.modules['rabbitmq.client']
    # Ensure we import fresh with stubbed pika and path to app
    if APP_PATH not in sys.path:
        sys.path.insert(0, APP_PATH)
    for name in list(sys.modules.keys()):
        if name == 'rabbitmq.client' or name == 'rabbitmq':
            del sys.modules[name]
    import importlib
    return importlib.import_module('rabbitmq.client')


class RabbitMQClientTests(unittest.TestCase):
    def test_publish_success(self):
        channel = MagicMock()
        channel.is_open = True
        connection = MagicMock()
        connection.is_open = True
        connection.channel.return_value = channel

        install_stub_pika(channel, connection)
        client_module = import_client_module()
        client = client_module.RabbitMQClient()
        self.addCleanup(client.close)

        ok = client.publish('test-queue', { 'a': 1 })

        self.assertTrue(ok)
        channel.queue_declare.assert_called_once()
        channel.basic_publish.assert_called_once()
        args, kwargs = channel.basic_publish.call_args
        self.assertEqual(kwargs.get('routing_key'), 'test-queue')
        body = kwargs.get('body')
        self.assertEqual(json.loads(body), { 'a': 1 })

    def test_publish_preserves_trace_headers(self):
        channel = MagicMock()
        connection = MagicMock()
        connection.channel.return_value = channel
        install_stub_pika(channel, connection)
        client_module = import_client_module()
        client = client_module.RabbitMQClient()
        self.addCleanup(client.close)

        client.publish(
            'test-queue',
            {'messageId': 'msg-1'},
            'corr-1',
            {'traceparent': '00-' + 'a' * 32 + '-' + 'b' * 16 + '-01'},
        )

        properties = channel.basic_publish.call_args.kwargs['properties']
        self.assertEqual(properties.headers['X-Correlation-Id'], 'corr-1')
        self.assertTrue(properties.headers['traceparent'].startswith('00-'))

    def test_consume_invokes_callback_and_acks(self):
        # Set up channel to capture callback
        channel = MagicMock()
        channel.is_open = True
        captured = {}

        def basic_consume(queue, on_message_callback, auto_ack=False):
            captured['cb'] = on_message_callback
            return 'ctag'

        def start_consuming_side_effect():
            # Simulate one delivery
            method = types.SimpleNamespace(delivery_tag=123)
            body = json.dumps({'x': 2}).encode()
            captured['cb'](channel, method, None, body)
            return None

        channel.basic_consume.side_effect = basic_consume
        channel.start_consuming.side_effect = start_consuming_side_effect

        connection = MagicMock()
        connection.is_open = True
        connection.channel.return_value = channel

        install_stub_pika(channel, connection)
        client_module = import_client_module()
        client = client_module.RabbitMQClient()
        self.addCleanup(client.close)

        received = []
        def cb(msg):
            received.append(msg)

        client.consume('orders', cb)

        self.assertEqual(received, [{'x': 2}])
        channel.basic_ack.assert_called_once()

    def test_duplicate_is_acknowledged_without_second_callback(self):
        channel = MagicMock()
        captured = {}

        def basic_consume(queue, on_message_callback, auto_ack=False):
            captured['cb'] = on_message_callback

        def start_consuming_side_effect():
            method = types.SimpleNamespace(delivery_tag=1)
            properties = types.SimpleNamespace(message_id='msg-1', headers={})
            body = json.dumps({'orderId': 'order-1'}).encode()
            captured['cb'](channel, method, properties, body)
            method.delivery_tag = 2
            captured['cb'](channel, method, properties, body)

        channel.basic_consume.side_effect = basic_consume
        channel.start_consuming.side_effect = start_consuming_side_effect
        connection = MagicMock()
        connection.channel.return_value = channel
        install_stub_pika(channel, connection)
        client_module = import_client_module()
        client = client_module.RabbitMQClient()
        self.addCleanup(client.close)
        received = []

        client.consume('orders', lambda message: received.append(message))

        self.assertEqual(len(received), 1)
        self.assertEqual(channel.basic_ack.call_count, 2)

    def test_failed_callback_releases_dedup_lock(self):
        channel = MagicMock()
        captured = {}

        def basic_consume(queue, on_message_callback, auto_ack=False):
            captured['cb'] = on_message_callback

        def start_consuming_side_effect():
            method = types.SimpleNamespace(delivery_tag=1)
            properties = types.SimpleNamespace(message_id='msg-1', headers={})
            body = json.dumps({'orderId': 'order-2'}).encode()
            captured['cb'](channel, method, properties, body)
            method.delivery_tag = 2
            captured['cb'](channel, method, properties, body)

        channel.basic_consume.side_effect = basic_consume
        channel.start_consuming.side_effect = start_consuming_side_effect
        connection = MagicMock()
        connection.channel.return_value = channel
        install_stub_pika(channel, connection)
        client_module = import_client_module()
        client = client_module.RabbitMQClient()
        attempts = []

        def callback(message):
            attempts.append(message)
            if len(attempts) == 1:
                raise RuntimeError('temporary failure')

        client.consume('orders', callback)

        self.assertEqual(len(attempts), 2)
        self.assertEqual(channel.basic_nack.call_args.kwargs['requeue'], True)
        self.assertEqual(channel.basic_ack.call_count, 1)


class WarehouseQueueFailureTests(unittest.TestCase):
    """Failure reporting, poison messages, stale dedup rows and consumer supervision."""

    def build(self, queue='warehouse-queue', deliveries=None, callback=None, properties=None):
        channel = MagicMock()
        captured = {}

        def basic_consume(queue, on_message_callback, auto_ack=False):
            captured['cb'] = on_message_callback

        def start_consuming():
            for tag, body in deliveries:
                method = types.SimpleNamespace(delivery_tag=tag)
                captured['cb'](channel, method, properties, body)

        channel.basic_consume.side_effect = basic_consume
        channel.start_consuming.side_effect = start_consuming
        connection = MagicMock()
        connection.channel.return_value = channel
        install_stub_pika(channel, connection)
        client = import_client_module().RabbitMQClient()
        self.addCleanup(client.close)
        client.consume(queue, callback)
        return client, channel

    @staticmethod
    def published_bodies(channel):
        return [json.loads(call.kwargs['body']) for call in channel.basic_publish.call_args_list
                if call.kwargs.get('routing_key') == 'warehouse-updates']

    def order_body(self, order_id='order-1'):
        return json.dumps({'orderId': order_id}).encode()

    def test_exhausted_retries_report_failure_and_dead_letter(self):
        props = types.SimpleNamespace(message_id='msg-1', headers={})
        attempts = []

        def callback(message):
            attempts.append(message)
            raise RuntimeError('WMS unreachable')

        _, channel = self.build(deliveries=[(i, self.order_body()) for i in range(1, 5)],
                                callback=callback, properties=props)

        requeues = [call.kwargs['requeue'] for call in channel.basic_nack.call_args_list]
        self.assertEqual(requeues, [True, True, True, False])
        failures = self.published_bodies(channel)
        self.assertEqual(len(failures), 1)
        self.assertEqual(failures[0]['orderId'], 'order-1')
        self.assertEqual(failures[0]['status'], 'FAILED')
        self.assertTrue(failures[0]['messageId'])

    def test_no_failure_is_reported_while_retries_remain(self):
        props = types.SimpleNamespace(message_id='msg-1', headers={})

        def callback(message):
            raise RuntimeError('transient')

        _, channel = self.build(deliveries=[(1, self.order_body())], callback=callback, properties=props)

        self.assertEqual(self.published_bodies(channel), [])
        self.assertEqual(channel.basic_nack.call_args.kwargs['requeue'], True)

    def test_non_retryable_failure_reports_failed_and_dead_letters(self):
        props = types.SimpleNamespace(message_id='msg-2', headers={})

        def callback(message):
            raise ValueError('cannot build WMS message')

        _, channel = self.build(deliveries=[(1, self.order_body('order-2'))], callback=callback, properties=props)

        self.assertEqual(channel.basic_nack.call_args.kwargs['requeue'], False)
        self.assertEqual([b['orderId'] for b in self.published_bodies(channel)], ['order-2'])

    def test_compensation_queue_failures_do_not_publish_packaging_failures(self):
        props = types.SimpleNamespace(message_id='msg-3', headers={})

        def callback(message):
            raise ValueError('boom')

        _, channel = self.build(queue='warehouse-compensation', deliveries=[(1, self.order_body('order-3'))],
                                callback=callback, properties=props)

        self.assertEqual(self.published_bodies(channel), [])
        self.assertEqual(channel.basic_nack.call_args.kwargs['requeue'], False)

    def test_unreadable_message_is_dead_lettered_and_consumer_continues(self):
        props = types.SimpleNamespace(message_id='msg-4', headers={})
        received = []

        _, channel = self.build(deliveries=[(1, b'{not json'), (2, self.order_body('order-4'))],
                                callback=lambda message: received.append(message), properties=props)

        self.assertEqual(channel.basic_nack.call_args_list[0].kwargs, {'delivery_tag': 1, 'requeue': False})
        self.assertEqual(received, [{'orderId': 'order-4'}])
        self.assertEqual(self.published_bodies(channel), [])

    def _seed_and_consume(self, status, age_seconds):
        channel = MagicMock()
        captured = {}
        received = []

        def basic_consume(queue, on_message_callback, auto_ack=False):
            captured['cb'] = on_message_callback

        channel.basic_consume.side_effect = basic_consume
        connection = MagicMock()
        connection.channel.return_value = channel
        install_stub_pika(channel, connection)
        client = import_client_module().RabbitMQClient()
        self.addCleanup(client.close)
        client.dedup_connection.execute(
            "INSERT INTO processed_orders (dedup_key, status, created_at) VALUES (?, ?, ?)",
            ('order-5:WMS_PACKAGING', status, int(time.time()) - age_seconds))
        client.dedup_connection.commit()

        def start_consuming():
            props = types.SimpleNamespace(message_id='msg-5', headers={})
            captured['cb'](channel, types.SimpleNamespace(delivery_tag=1), props, self.order_body('order-5'))

        channel.start_consuming.side_effect = start_consuming
        client.consume('warehouse-queue', lambda message: received.append(message))
        return received, channel

    def test_stale_processing_row_is_reclaimed_on_redelivery(self):
        received, channel = self._seed_and_consume('PROCESSING', 120)

        self.assertEqual(received, [{'orderId': 'order-5'}])
        channel.basic_ack.assert_called_once()

    def test_recent_processing_row_is_treated_as_a_duplicate(self):
        received, channel = self._seed_and_consume('PROCESSING', 5)

        self.assertEqual(received, [])
        channel.basic_ack.assert_called_once()

    def test_completed_rows_are_never_reclaimed(self):
        received, _ = self._seed_and_consume('COMPLETED', 7200)

        self.assertEqual(received, [])

    def test_consume_forever_restarts_after_a_failure(self):
        channel = MagicMock()
        connection = MagicMock()
        connection.channel.return_value = channel
        install_stub_pika(channel, connection)
        client_module = import_client_module()
        client = client_module.RabbitMQClient()
        self.addCleanup(client.close)
        stop = threading.Event()
        calls = []

        def flaky_consume(queue, callback):
            calls.append(queue)
            if len(calls) == 1:
                raise ConnectionError('broker restarted')
            stop.set()

        client.consume = flaky_consume
        with patch.object(client_module, 'CONSUMER_RESTART_DELAY_SECONDS', 0.01):
            client.consume_forever('warehouse-queue', lambda message: None, stop)

        self.assertEqual(calls, ['warehouse-queue', 'warehouse-queue'])


if __name__ == '__main__':
    unittest.main()
