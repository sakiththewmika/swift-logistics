import inspect
import sqlite3
import threading
import pika, json, os


class RabbitMQClient:
    def __init__(self):
        print("[RABBITMQ] Initializing RabbitMQ client...")
        self.lock = threading.Lock()
        self.processed_message_ids = set()
        self.retry_counts = {}
        self.dedup_lock = threading.Lock()
        dedup_path = os.getenv("DEDUP_DB_PATH", "/tmp/swift-wms-dedup.db")
        self.dedup_connection = sqlite3.connect(dedup_path, check_same_thread=False)
        self.dedup_connection.execute(
            "CREATE TABLE IF NOT EXISTS processed_orders "
            "(dedup_key TEXT PRIMARY KEY, status TEXT NOT NULL)"
        )
        self.dedup_connection.commit()

        # Create a connection only for consuming (persistent)
        self.consumer_connections = []

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

    def publish(self, queue, message, correlation_id=None):
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
                            headers={"X-Correlation-Id": correlation_id} if correlation_id else {},
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
            message = json.loads(body.decode())
            message_id = (properties.message_id if properties else None) or message.get("messageId") or message.get("orderId")
            step = "WMS_COMPENSATION" if queue == "warehouse-compensation" else "WMS_PACKAGING"
            dedup_key = f"{message.get('orderId')}:{step}"
            with self.dedup_lock:
                try:
                    self.dedup_connection.execute(
                        "INSERT INTO processed_orders (dedup_key, status) VALUES (?, ?)",
                        (dedup_key, "PROCESSING"),
                    )
                    self.dedup_connection.commit()
                except sqlite3.IntegrityError:
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
                with self.dedup_lock:
                    self.dedup_connection.execute(
                        "DELETE FROM processed_orders WHERE dedup_key = ?", (dedup_key,)
                    )
                    self.dedup_connection.commit()
                with self.lock:
                    retries = self.retry_counts.get(message_id, 0) + 1
                    self.retry_counts[message_id] = retries
                should_retry = retries < 4
                print(f"[RABBITMQ] Transient adapter failure (attempt {retries}/4): {exc}")
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=should_retry)
            except Exception as exc:
                with self.dedup_lock:
                    self.dedup_connection.execute(
                        "DELETE FROM processed_orders WHERE dedup_key = ?", (dedup_key,)
                    )
                    self.dedup_connection.commit()
                print(f"[RABBITMQ] Non-retryable message failure: {exc}")
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
