import sys
import os
import types
import json
import unittest
from unittest.mock import MagicMock

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


if __name__ == '__main__':
    unittest.main()
