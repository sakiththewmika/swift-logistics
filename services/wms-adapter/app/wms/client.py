# wms_client.py
import os
import socket
import threading
import time
from consul import discover_service

CONNECT_TIMEOUT_SECONDS = 5
RECV_BUFFER_BYTES = 4096
RECONNECT_BACKOFF_START = 1
RECONNECT_BACKOFF_MAX = 10
MAX_FRAME_BYTES = 64 * 1024


class WMSClient:
    """Line-oriented TCP client for the warehouse system.

    One socket is shared by the sender threads (RabbitMQ consumers) and the listener thread.
    ``self._lock`` guards the socket reference and every write, so frames are never interleaved and
    a reconnect cannot swap the socket underneath a half-written message. Nothing connects at
    construction time: the first send or the listener opens the connection (with retry).
    """

    def __init__(self):
        self.host = os.getenv("WMS_TCP_HOST", "localhost")
        self.port = int(os.getenv("WMS_TCP_PORT", 9000))
        self.sock = None
        self._lock = threading.RLock()

    def refresh_endpoint(self):
        last_error = None
        for attempt in range(6):
            try:
                self.host, self.port = discover_service(
                    os.getenv("WMS_SERVICE_NAME", "wms-mock")
                )
                print(f"[WMS-ADAPTER] Discovered WMS at {self.host}:{self.port}")
                return
            except Exception as exc:
                last_error = exc
                time.sleep(2)
        print(f"[WMS-ADAPTER] Consul lookup unavailable; using configured WMS endpoint: {last_error}")

    # ----- connection management -----

    def connect(self):
        """(Re)opens the connection, replacing any existing socket."""
        with self._lock:
            self._close_locked()
            self._open_locked()

    def _open_locked(self):
        sock = socket.create_connection((self.host, self.port), timeout=CONNECT_TIMEOUT_SECONDS)
        sock.settimeout(None)
        self.sock = sock
        print(f"[WMS-ADAPTER] Connected to WMS at {self.host}:{self.port}")

    def _close_locked(self):
        sock, self.sock = self.sock, None
        if sock is not None:
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            try:
                sock.close()
            except OSError:
                pass

    def _ensure_connected(self):
        """Returns the live socket, opening one if needed."""
        with self._lock:
            if self.sock is None:
                self._open_locked()
            return self.sock

    def disconnect(self, sock=None):
        """Drops the connection; if `sock` is given, only when it is still the current one."""
        with self._lock:
            if sock is None or self.sock is sock:
                self._close_locked()

    # ----- sending -----

    def send_order(self, order_data):
        order_id = str(order_data).split(":", 1)[0]
        self._send_with_retry(f"{order_data}\n", f"order {order_id}")

    def cancel_package(self, order_id):
        self._send_with_retry(f"CANCEL_PACKAGE|{order_id}\n", f"compensation for order {order_id}")

    def _send_with_retry(self, message, description):
        payload = message.encode()
        last_error = None
        for attempt in range(4):
            try:
                with self._lock:
                    self._ensure_connected().sendall(payload)
                print(f"[WMS-ADAPTER] Sent {description}")
                return
            except OSError as exc:  # includes broken pipe, reset, refused and timeouts
                last_error = exc
                self.disconnect()
                if attempt == 3:
                    break
                delay = 2 ** attempt
                print(f"[WMS-ADAPTER] Transient socket error; retrying in {delay}s: {exc}")
                time.sleep(delay)
        raise RuntimeError(f"Unable to send {description} after transient retries") from last_error

    # ----- receiving -----

    def listen_for_updates(self, callback, stop_event=None):
        """Reads newline-delimited updates forever, reconnecting whenever the connection drops.

        Bytes are accumulated in a buffer and only complete lines are handed to `callback`, so a
        message split across TCP segments is never torn. Errors in `callback` are logged and do not
        end the loop. `stop_event` (a threading.Event) lets tests and shutdown stop the loop.
        """
        print("[WMS-ADAPTER] Listening for wms updates...")
        backoff = RECONNECT_BACKOFF_START
        buffer = b""
        while stop_event is None or not stop_event.is_set():
            sock = None
            try:
                sock = self._ensure_connected()
                backoff = RECONNECT_BACKOFF_START
                data = sock.recv(RECV_BUFFER_BYTES)
                if not data:
                    raise ConnectionError("WMS closed the connection")
                buffer += data
                buffer = self._dispatch_lines(buffer, callback)
            except OSError as exc:
                print(f"[WMS-ADAPTER] WMS connection lost ({exc}); reconnecting in {backoff}s")
                if sock is not None:
                    self.disconnect(sock)
                buffer = b""  # a partial frame from a dead connection can never be completed
                if stop_event is not None:
                    stop_event.wait(backoff)
                else:
                    time.sleep(backoff)
                backoff = min(backoff * 2, RECONNECT_BACKOFF_MAX)
        print("[WMS] Listener stopped")

    def _dispatch_lines(self, buffer, callback):
        *lines, remainder = buffer.split(b"\n")
        for raw in lines:
            line = raw.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            print(f"[WMS-ADAPTER] Received line: {line}")
            try:
                callback(line)
            except Exception as exc:
                print(f"[WMS-ADAPTER] Update handler failed for '{line}': {exc}")
        if len(remainder) > MAX_FRAME_BYTES:
            print("[WMS-ADAPTER] Discarding oversized unterminated frame")
            return b""
        return remainder
