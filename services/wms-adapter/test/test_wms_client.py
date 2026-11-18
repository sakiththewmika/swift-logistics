import importlib
import os
import socket
import sys
import threading
import time
import unittest
from unittest import mock

APP_PATH = __file__.split('/services/wms-adapter/')[0] + '/services/wms-adapter/app'


def load_client_module():
    if APP_PATH not in sys.path:
        sys.path.insert(0, APP_PATH)
    for name in ('wms.client', 'wms'):
        sys.modules.pop(name, None)
    return importlib.import_module('wms.client')


class ScriptedServer:
    """Accepts connections one at a time and runs a handler(conn, index) for each."""

    def __init__(self, handler):
        self.handler = handler
        self.listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.listener.bind(('127.0.0.1', 0))
        self.listener.listen()
        self.port = self.listener.getsockname()[1]
        self.connections = 0
        self.thread = threading.Thread(target=self._serve, daemon=True)
        self.thread.start()

    def _serve(self):
        while True:
            try:
                conn, _ = self.listener.accept()
            except OSError:
                return
            index = self.connections
            self.connections += 1
            threading.Thread(target=self._run, args=(conn, index), daemon=True).start()

    def _run(self, conn, index):
        try:
            self.handler(conn, index)
        finally:
            try:
                conn.close()
            except OSError:
                pass

    def close(self):
        self.listener.close()


class WMSClientTests(unittest.TestCase):
    def setUp(self):
        self.module = load_client_module()
        patcher = mock.patch.object(self.module, 'RECONNECT_BACKOFF_START', 0.02)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.servers = []
        self.stop = threading.Event()
        self.clients = []

    def tearDown(self):
        self.stop.set()
        for client in self.clients:
            client.disconnect()
        for server in self.servers:
            server.close()

    def server(self, handler):
        server = ScriptedServer(handler)
        self.servers.append(server)
        return server

    def client_for(self, server):
        client = self.module.WMSClient()
        client.host, client.port = '127.0.0.1', server.port
        self.clients.append(client)
        return client

    def listen(self, client, expected, timeout=5):
        received = []
        done = threading.Event()

        def callback(line):
            received.append(line)
            if len(received) >= expected:
                done.set()

        thread = threading.Thread(target=client.listen_for_updates, args=(callback, self.stop), daemon=True)
        thread.start()
        self.assertTrue(done.wait(timeout), f"only received {received}")
        return received

    # ----- construction -----

    def test_construction_does_not_connect(self):
        with mock.patch.dict(os.environ, {'WMS_TCP_HOST': '127.0.0.1', 'WMS_TCP_PORT': '1'}):
            client = self.module.WMSClient()  # nothing is listening on port 1; must not raise
        self.assertIsNone(client.sock)

    # ----- framing -----

    def test_frames_split_across_segments_are_reassembled(self):
        def handler(conn, index):
            conn.sendall(b'ORD1:REA')
            time.sleep(0.1)
            conn.sendall(b'DY\nORD2:READY\nPACKAGE_')
            time.sleep(0.1)
            conn.sendall(b'RELEASED|ORD3\n')
            time.sleep(0.5)

        client = self.client_for(self.server(handler))

        self.assertEqual(self.listen(client, 3), ['ORD1:READY', 'ORD2:READY', 'PACKAGE_RELEASED|ORD3'])

    def test_a_failing_handler_does_not_end_the_listener(self):
        def handler(conn, index):
            conn.sendall(b'A:READY\nB:READY\n')
            time.sleep(0.5)

        client = self.client_for(self.server(handler))
        received = []
        done = threading.Event()

        def callback(line):
            received.append(line)
            if line.startswith('A'):
                raise ValueError('handler blew up')
            done.set()

        threading.Thread(target=client.listen_for_updates, args=(callback, self.stop), daemon=True).start()

        self.assertTrue(done.wait(5))
        self.assertEqual(received, ['A:READY', 'B:READY'])

    # ----- reconnect -----

    def test_listener_reconnects_after_the_wms_restarts(self):
        def handler(conn, index):
            conn.sendall(f'ORD{index}:READY\n'.encode())
            if index == 0:
                return  # server drops the connection right after the first update
            time.sleep(0.5)

        server = self.server(handler)
        client = self.client_for(server)

        received = self.listen(client, 2)

        self.assertEqual(received, ['ORD0:READY', 'ORD1:READY'])
        self.assertGreaterEqual(server.connections, 2)

    def test_partial_frame_is_discarded_when_the_connection_dies(self):
        def handler(conn, index):
            if index == 0:
                conn.sendall(b'ORD0:RE')  # never completed
                return
            conn.sendall(b'ORD1:READY\n')
            time.sleep(0.5)

        client = self.client_for(self.server(handler))

        self.assertEqual(self.listen(client, 1), ['ORD1:READY'])

    def test_listener_keeps_retrying_while_the_wms_is_down(self):
        server = self.server(lambda conn, index: conn.sendall(b'ORD1:READY\n') or time.sleep(0.5))
        client = self.client_for(server)
        real_port = server.port
        client.port = 1  # nothing listens here yet

        received = []
        done = threading.Event()
        threading.Thread(target=client.listen_for_updates,
                         args=(lambda line: (received.append(line), done.set()), self.stop), daemon=True).start()
        time.sleep(0.2)  # a few failed connection attempts
        client.port = real_port

        self.assertTrue(done.wait(5))
        self.assertEqual(received, ['ORD1:READY'])

    # ----- sending -----

    def test_orders_are_sent_as_raw_unquoted_lines(self):
        captured = []
        got = threading.Event()

        def handler(conn, index):
            data = b''
            while b'\n' not in data:
                data += conn.recv(1024)
            captured.append(data)
            got.set()

        client = self.client_for(self.server(handler))

        client.send_order('ORD9:BILLED')

        self.assertTrue(got.wait(5))
        self.assertEqual(captured[0], b'ORD9:BILLED\n')

    def test_cancel_package_line(self):
        captured = []
        got = threading.Event()

        def handler(conn, index):
            data = b''
            while b'\n' not in data:
                data += conn.recv(1024)
            captured.append(data)
            got.set()

        client = self.client_for(self.server(handler))

        client.cancel_package('ORD9')

        self.assertTrue(got.wait(5))
        self.assertEqual(captured[0], b'CANCEL_PACKAGE|ORD9\n')

    def test_concurrent_senders_never_interleave_frames(self):
        total = 8 * 60
        lines = []
        done = threading.Event()

        def handler(conn, index):
            buffer = b''
            while len(lines) < total:
                data = conn.recv(4096)
                if not data:
                    return
                buffer += data
                *complete, buffer = buffer.split(b'\n')
                lines.extend(complete)
            done.set()

        client = self.client_for(self.server(handler))

        def send(worker):
            for n in range(60):
                client.send_order(f'W{worker}-ORD{n}:BILLED-' + 'x' * 400)

        threads = [threading.Thread(target=send, args=(w,)) for w in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertTrue(done.wait(10))
        self.assertEqual(len(lines), total)
        for raw in lines:
            text = raw.decode()
            self.assertRegex(text, r'^W\d-ORD\d+:BILLED-x{400}$')

    def test_send_connects_lazily_and_reports_failure_after_retries(self):
        client = self.module.WMSClient()
        client.host, client.port = '127.0.0.1', 1
        self.clients.append(client)

        with mock.patch.object(self.module.time, 'sleep'):
            with self.assertRaises(RuntimeError):
                client.send_order('ORD1:BILLED')


if __name__ == '__main__':
    unittest.main()
