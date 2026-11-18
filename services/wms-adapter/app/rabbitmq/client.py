import inspect
import sqlite3
import threading
import hashlib
import json
import os
import re
import time
import urllib.request
import uuid

import pika


def _header_value(headers, name):
    value = headers.get(name) or headers.get(name.lower())
    if value is None:
        value = headers.get(name.encode())
    if isinstance(value, bytes):
        return value.decode()
    return value


def _trace_context(headers, correlation_id):
    headers = headers or {}
    traceparent = _header_value(headers, "traceparent")
    match = re.fullmatch(r"00-([0-9a-fA-F]{32})-([0-9a-fA-F]{16})-[0-9a-fA-F]{2}", str(traceparent or ""))
    if match:
        return match.group(1).lower(), match.group(2).lower()

    trace_id = _header_value(headers, "X-B3-TraceId")
    parent_id = _header_value(headers, "X-B3-SpanId")
    if trace_id and re.fullmatch(r"[0-9a-fA-F]{16,32}", str(trace_id)):
        return str(trace_id).lower().zfill(32), str(parent_id).lower() if parent_id else None

    seed = str(correlation_id or os.urandom(16).hex()).encode()
    return hashlib.sha256(seed).hexdigest()[:32], None


def emit_zipkin_span(service_name, span_name, headers, correlation_id, start_time_us, duration_us, tags=None):
    trace_id, parent_span_id = _trace_context(headers, correlation_id)
    span_id = os.urandom(8).hex()
    span = {
        "traceId": trace_id,
        "parentId": parent_span_id,
        "id": span_id,
        "name": span_name,
        "kind": "CONSUMER",
        "timestamp": start_time_us,
        "duration": max(duration_us, 1),
        "localEndpoint": {"serviceName": service_name},
        "tags": {"correlationId": str(correlation_id), **(tags or {})},
    }
    endpoint = os.getenv("ZIPKIN_ENDPOINT", "http://zipkin:9411/api/v2/spans")
    try:
        request = urllib.request.Request(
            endpoint,
            data=json.dumps([span]).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=1.0):
            pass
    except Exception as exc:
        print(f"[ZIPKIN] Span export unavailable: {exc}")
    return f"00-{trace_id}-{span_id}-01"


# A dedup row left in PROCESSING longer than this belongs to a crashed attempt and may be reclaimed.
DEDUP_STALE_SECONDS = int(os.getenv("DEDUP_STALE_SECONDS", "60"))
MAX_DELIVERY_ATTEMPTS = 4
CONSUMER_RESTART_DELAY_SECONDS = 5


class RabbitMQClient:
    def __init__(self):
        print("[RABBITMQ] Initializing RabbitMQ client...")
        self.lock = threading.Lock()
        self.processed_message_ids = set()
        self.retry_counts = {}
        self.dedup_lock = threading.Lock()
        self._last_dedup_cleanup = 0
        dedup_path = os.getenv("DEDUP_DB_PATH", "/tmp/swift-wms-dedup.db")
        self.dedup_connection = sqlite3.connect(dedup_path, check_same_thread=False)
        self.dedup_connection.execute("PRAGMA journal_mode=WAL")
        self.dedup_connection.execute("PRAGMA synchronous=NORMAL")
        self.dedup_connection.execute("PRAGMA busy_timeout=5000")
        self.dedup_connection.execute(
            "CREATE TABLE IF NOT EXISTS processed_orders "
            "(dedup_key TEXT PRIMARY KEY, status TEXT NOT NULL, "
            "created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')))"
        )
        columns = {
            row[1]
            for row in self.dedup_connection.execute("PRAGMA table_info(processed_orders)")
        }
        if "created_at" not in columns:
            self.dedup_connection.execute(
                "ALTER TABLE processed_orders ADD COLUMN created_at INTEGER"
            )
            self.dedup_connection.execute(
                "UPDATE processed_orders SET created_at = strftime('%s','now') "
                "WHERE created_at IS NULL"
            )
        self.dedup_connection.commit()
        self.cleanup_expired_dedup_records()

        # Create a connection only for consuming (persistent)
        self.consumer_connections = []

    def cleanup_expired_dedup_records(self, retention_seconds=86400):
        cutoff = int(time.time()) - retention_seconds
        with self.dedup_lock:
            self.dedup_connection.execute(
                "DELETE FROM processed_orders WHERE created_at < ?", (cutoff,)
            )
            self.dedup_connection.commit()
        self._last_dedup_cleanup = time.time()

    def _new_connection(self):
        return pika.BlockingConnection(
            pika.ConnectionParameters(
                host=os.getenv("RABBITMQ_HOST", "swift-rabbitmq"),
                port=int(os.getenv("RABBITMQ_PORT", 5672)),
                credentials=pika.PlainCredentials(
                    os.getenv("RABBITMQ_USER", "guest"),
                    os.getenv("RABBITMQ_PASS", "guest")
                )
            )
        )

    def _new_publish_channel(self):
        """Create a short-lived connection + channel just for publishing."""
        connection = pika.BlockingConnection(
            pika.ConnectionParameters(
                host=os.getenv("RABBITMQ_HOST", "swift-rabbitmq"),
                port=int(os.getenv("RABBITMQ_PORT", 5672)),
                credentials=pika.PlainCredentials(
                    os.getenv("RABBITMQ_USER", "guest"),
                    os.getenv("RABBITMQ_PASS", "guest")
                )
            )
        )
        channel = connection.channel()
        return connection, channel

    def publish(self, queue, message, correlation_id=None, headers=None):
        """Publish using a fresh connection to avoid thread issues."""
        connection, channel = self._new_publish_channel()
        try:
            queue_args = {
                "x-dead-letter-exchange":  "warehouse.exchange.dlx",
                "x-dead-letter-routing-key": "warehouse-updates.dlq"
            }
            channel.queue_declare(queue=queue, durable=True, arguments=queue_args)
            for attempt in range(4):
                try:
                    channel.basic_publish(
                        exchange="",
                        routing_key=queue,
                        body=json.dumps(message),
                        properties=pika.BasicProperties(
                            delivery_mode=2,
                            message_id=message.get("messageId"),
                            correlation_id=correlation_id,
                            headers={
                                **(headers or {}),
                                **({"X-Correlation-Id": correlation_id} if correlation_id else {}),
                            },
                        )
                    )
                    break
                except (pika.exceptions.AMQPConnectionError, OSError):
                    if attempt == 3:
                        raise
                    import time
                    time.sleep(2 ** attempt)
            print(f"[RABBITMQ] Published to {queue}: {message}")
            return True
        finally:
            channel.close()
            connection.close()

    def _claim_dedup(self, dedup_key):
        """Claims dedup_key; reclaims a PROCESSING row abandoned by a crashed attempt. False = duplicate."""
        with self.dedup_lock:
            now = int(time.time())
            try:
                self.dedup_connection.execute(
                    "INSERT INTO processed_orders (dedup_key, status, created_at) VALUES (?, ?, ?)",
                    (dedup_key, "PROCESSING", now),
                )
                self.dedup_connection.commit()
                return True
            except sqlite3.IntegrityError:
                row = self.dedup_connection.execute(
                    "SELECT status, created_at FROM processed_orders WHERE dedup_key = ?",
                    (dedup_key,),
                ).fetchone()
                if row and row[0] == "PROCESSING" and (row[1] or 0) < now - DEDUP_STALE_SECONDS:
                    self.dedup_connection.execute(
                        "UPDATE processed_orders SET created_at = ? WHERE dedup_key = ? AND status = 'PROCESSING'",
                        (now, dedup_key),
                    )
                    self.dedup_connection.commit()
                    print(f"[RABBITMQ] Reclaimed stale PROCESSING dedup entry {dedup_key}")
                    return True
                return False

    def _release_dedup(self, dedup_key):
        with self.dedup_lock:
            self.dedup_connection.execute(
                "DELETE FROM processed_orders WHERE dedup_key = ?", (dedup_key,)
            )
            self.dedup_connection.commit()

    def _notify_packaging_failed(self, message):
        """Tells the orchestrator packaging cannot happen so it starts billing compensation."""
        order_id = message.get("orderId") if isinstance(message, dict) else None
        if not order_id:
            return
        try:
            self.publish("warehouse-updates", {
                "messageId": str(uuid.uuid4()),
                "orderId": order_id,
                "status": "FAILED",
            })
            print(f"[RABBITMQ] Reported warehouse FAILED for order {order_id}")
        except Exception as exc:
            print(f"[RABBITMQ] Unable to report warehouse failure for order {order_id}: {exc}")

    def consume_forever(self, queue, callback, stop_event=None):
        """Runs consume() and restarts it after any failure (broker restart, dropped connection)."""
        while stop_event is None or not stop_event.is_set():
            try:
                self.consume(queue, callback)
            except Exception as exc:
                print(f"[RABBITMQ] Consumer for {queue} stopped ({type(exc).__name__}: {exc}); "
                      f"restarting in {CONSUMER_RESTART_DELAY_SECONDS}s")
            if stop_event is not None:
                stop_event.wait(CONSUMER_RESTART_DELAY_SECONDS)
            else:
                time.sleep(CONSUMER_RESTART_DELAY_SECONDS)

    def consume(self, queue, callback):
        """Consume with a persistent connection/channel in a dedicated thread."""
        queue_args = {
            "x-dead-letter-exchange": "warehouse.exchange.dlx",
            "x-dead-letter-routing-key": f"{queue}.dlq"
        }
        connection = self._new_connection()
        channel = connection.channel()
        self.consumer_connections.append(connection)
        channel.queue_declare(queue=queue, durable=True, arguments=queue_args)

        def on_message(ch, method, properties, body):
            if time.time() - self._last_dedup_cleanup >= 3600:
                self.cleanup_expired_dedup_records()
            try:
                message = json.loads(body.decode())
                if not isinstance(message, dict):
                    raise ValueError("message body is not a JSON object")
            except (ValueError, UnicodeDecodeError) as exc:
                # A poison message must not kill the consumer: dead-letter it.
                print(f"[RABBITMQ] Unreadable message on {queue}: {exc}")
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
                return
            message_id = (properties.message_id if properties else None) or message.get("messageId") or message.get("orderId")
            step = "WMS_COMPENSATION" if queue == "warehouse-compensation" else "WMS_PACKAGING"
            dedup_key = f"{message.get('orderId')}:{step}"
            if not self._claim_dedup(dedup_key):
                ch.basic_ack(delivery_tag=method.delivery_tag)
                print(f"[RABBITMQ] Duplicate {dedup_key} acknowledged")
                return
            with self.lock:
                if message_id in self.processed_message_ids:
                    ch.basic_ack(delivery_tag=method.delivery_tag)
                    return
            try:
                parameters = inspect.signature(callback).parameters
                if len(parameters) >= 2:
                    callback(message, properties)
                else:
                    callback(message)
                with self.lock:
                    self.processed_message_ids.add(message_id)
                    self.retry_counts.pop(message_id, None)
                with self.dedup_lock:
                    self.dedup_connection.execute(
                        "UPDATE processed_orders SET status = ? WHERE dedup_key = ?",
                        ("COMPLETED", dedup_key),
                    )
                    self.dedup_connection.commit()
                ch.basic_ack(delivery_tag=method.delivery_tag)
            except (RuntimeError, OSError) as exc:
                self._release_dedup(dedup_key)
                with self.lock:
                    retries = self.retry_counts.get(message_id, 0) + 1
                    self.retry_counts[message_id] = retries
                should_retry = retries < MAX_DELIVERY_ATTEMPTS
                print(f"[RABBITMQ] Transient adapter failure (attempt {retries}/{MAX_DELIVERY_ATTEMPTS}): {exc}")
                if not should_retry:
                    with self.lock:
                        self.retry_counts.pop(message_id, None)
                    if queue == "warehouse-queue":
                        self._notify_packaging_failed(message)
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=should_retry)
            except Exception as exc:
                self._release_dedup(dedup_key)
                print(f"[RABBITMQ] Non-retryable message failure: {exc}")
                if queue == "warehouse-queue":
                    self._notify_packaging_failed(message)
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

        channel.basic_consume(queue=queue, on_message_callback=on_message)
        print(f"[RABBITMQ] Listening on {queue}...")
        try:
            channel.start_consuming()
        finally:
            if connection.is_open:
                connection.close()

    def close(self):
        for connection in self.consumer_connections:
            if connection.is_open:
                connection.close()
        self.dedup_connection.close()
