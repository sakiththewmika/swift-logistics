# mock_wms_server.py
import socket
import threading
import time
import os

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", 9000))

orders_received = []


def handle_client(conn, addr):
    print(f"[MOCK-WMS] Connected by {addr}")
    send_lock = threading.Lock()  # replies come from several threads; keep each line intact
    buffer = b""
    with conn:
        while True:
            try:
                data = conn.recv(1024)
                if not data:
                    print("[MOCK-WMS] No data received. Closing connection.")
                    break

                # TCP is a stream: only act on complete newline-terminated lines.
                buffer += data
                *lines, buffer = buffer.split(b"\n")
                for raw in lines:
                    line = raw.decode(errors="replace").strip()
                    if not line:
                        continue
                    if line.startswith("CANCEL_PACKAGE|"):
                        order_id = line.split("|", 1)[1].strip()
                        threading.Thread(
                            target=simulate_compensation,
                            args=(conn, order_id, send_lock),
                            daemon=True
                        ).start()
                        continue
                    if ':' in line:
                        order_id, event = line.split(':', 1)
                        order_id = order_id.strip('"')
                        orders_received.append(line)
                        print(f"[MOCK-WMS] Received order: {line}")
                        threading.Thread(
                            target=simulate_processing,
                            args=(conn, order_id, send_lock),
                            daemon=True
                        ).start()
                    else:
                        print("[MOCK-WMS] Invalid message received:", line)
            except (ConnectionResetError, OSError):
                print("[MOCK-WMS] Client disconnected unexpectedly.")
                break


def _reply(conn, message, send_lock):
    with send_lock:
        conn.sendall((message + "\n").encode())


def simulate_compensation(conn, order_id, send_lock=None):
    time.sleep(1)
    try:
        _reply(conn, f"PACKAGE_RELEASED|{order_id}", send_lock or threading.Lock())
        print(f"[MOCK-WMS] Sent: PACKAGE_RELEASED|{order_id}")
    except (BrokenPipeError, OSError):
        print("[MOCK-WMS] Failed to send compensation response.")


def simulate_processing(conn, order_id, send_lock=None):
    time.sleep(3)
    try:
        message = f"{order_id}:READY"
        _reply(conn, message, send_lock or threading.Lock())
        print(f"[MOCK-WMS] Sent: {message}")
    except (BrokenPipeError, OSError):
        print("[MOCK-WMS] Failed to send data back. Connection might be closed.")


def start_server():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind((HOST, PORT))
        s.listen()
        print(f"[MOCK-WMS] Server running on {HOST}:{PORT}")
        while True:
            conn, addr = s.accept()
            threading.Thread(target=handle_client, args=(conn, addr), daemon=True).start()


if __name__ == "__main__":
    start_server()
