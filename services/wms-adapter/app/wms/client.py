# wms_client.py
import json
import os
import socket
import time

class WMSClient:
    def __init__(self):
        self.host = os.getenv("WMS_TCP_HOST", "localhost") #On docker wms runs in the same container as wms-adapter, so localhost is fine
        self.port = int(os.getenv("WMS_TCP_PORT", 9000))
        self.sock = None
        self.connect()

    def connect(self):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.connect((self.host, self.port))
        print(f"[WMS-ADAPTER] Connected to WMS at {self.host}:{self.port}")

    def send_order(self, order_data):
        self._send_with_retry(json.dumps(order_data), f"order {order_data[0]}")

    def cancel_package(self, order_id):
        self._send_with_retry(f"CANCEL_PACKAGE|{order_id}", f"compensation for order {order_id}")

    def _send_with_retry(self, message, description):
        last_error = None
        for attempt in range(4):
            try:
                self.sock.sendall(message.encode() + b"\n")
                print(f"[WMS-ADAPTER] Sent {description}")
                return
            except (BrokenPipeError, ConnectionResetError, ConnectionRefusedError, socket.timeout, OSError) as exc:
                last_error = exc
                if attempt == 3:
                    break
                delay = 2 ** attempt
                print(f"[WMS-ADAPTER] Transient socket error; retrying in {delay}s: {exc}")
                try:
                    self.sock.close()
                except OSError:
                    pass
                time.sleep(delay)
                self.connect()
        raise RuntimeError(f"Unable to send {description} after transient retries") from last_error

    def listen_for_updates(self, callback):
        print("[WMS-ADAPTER] Listening for wms updates...")
        while True:
            data = self.sock.recv(1024)
            print(f"[WMS-ADAPTER] Received: {data}")
            if not data:
                break
            for line in data.decode("utf-8").strip().splitlines():
                print(f"[WMS-ADAPTER] Received line: {line}")
                callback(line)
        print("[WMS] Disconnected")
        self.sock.close()