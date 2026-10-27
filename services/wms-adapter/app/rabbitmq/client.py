import threading
import pika, json, os


class RabbitMQClient:
    def __init__(self):
        print("[RABBITMQ] Initializing RabbitMQ client...")
        self.lock = threading.Lock()
        self.processed_message_ids = set()

        # Create a connection only for consuming (persistent)
        self.consumer_connection = pika.BlockingConnection(
            pika.ConnectionParameters(
                host=os.getenv("RABBITMQ_HOST", "swift-rabbitmq"),
                port=int(os.getenv("RABBITMQ_PORT", 5672)),
                credentials=pika.PlainCredentials(
                    os.getenv("RABBITMQ_USER", "guest"),
                    os.getenv("RABBITMQ_PASS", "guest")
                )
            )
        )
        self.consumer_channel = self.consumer_connection.channel()

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

    def publish(self, queue, message):
        """Publish using a fresh connection to avoid thread issues."""
        if message["status"] != "READY":
            print(f"[RABBITMQ] Skipping publish for non-READY status: {message}")
            return
        connection, channel = self._new_publish_channel()
        try:
            queue_args = {
                "x-dead-letter-exchange":  "warehouse.exchange.dlx",
                "x-dead-letter-routing-key": "warehouse-updates.dlq"
            }
            channel.queue_declare(queue=queue, durable=True, arguments=queue_args)
            channel.basic_publish(
                exchange="",
                routing_key=queue,
                body=json.dumps(message),
                properties=pika.BasicProperties(delivery_mode=2)
            )
            print(f"[RABBITMQ] Published to {queue}: {message}")
        finally:
            channel.close()
            connection.close()

    def consume(self, queue, callback):
        """Consume with a persistent connection/channel in a dedicated thread."""
        queue_args = {
            "x-dead-letter-exchange": "warehouse.exchange.dlx",
            "x-dead-letter-routing-key": "warehouse-queue.dlq"
        }
        self.consumer_channel.queue_declare(queue=queue, durable=True, arguments=queue_args)

        def on_message(ch, method, properties, body):
            message = json.loads(body.decode())
            message_id = (properties.message_id if properties else None) or message.get("messageId") or message.get("orderId")
            with self.lock:
                if message_id in self.processed_message_ids:
                    ch.basic_ack(delivery_tag=method.delivery_tag)
                    return
            try:
                callback(message)
                with self.lock:
                    self.processed_message_ids.add(message_id)
                ch.basic_ack(delivery_tag=method.delivery_tag)
            except Exception:
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)

        self.consumer_channel.basic_consume(queue=queue, on_message_callback=on_message)
        print(f"[RABBITMQ] Listening on {queue}...")
        self.consumer_channel.start_consuming()

    def close(self):
        if self.consumer_connection and self.consumer_connection.is_open:
            self.consumer_connection.close()
