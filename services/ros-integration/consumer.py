import pika
import json
import httpx
from motor.motor_asyncio import AsyncIOMotorClient
import os
import asyncio
from datetime import datetime, timezone
from threading import Lock
from time import monotonic

# --- Configuration ---
# Using environment variables for configuration is a best practice.
RABBITMQ_URI = os.getenv("RABBITMQ_URI", "amqp://guest:guest@rabbitmq:5672/")
MONGO_URI = os.getenv("MONGO_URI", "mongodb+srv://orchestrator:LRg4OV1lEtpA5WMs@main.wgytsql.mongodb.net/swift-logic")
# This special URL points from inside a Docker container to your host machine.
ROS_API_URL = "http://localhost:3001/optimize-route" #On docker wms runs in the same container as wms-adapter, so localhost is fine

# --- UPDATED QUEUE NAMES ---
INCOMING_QUEUE = "route-planning"
incoming_queue_args = {
    "x-dead-letter-exchange": "route.exchange.dlx",
    "x-dead-letter-routing-key": "route-planning.dlq"
}
OUTGOING_QUEUE = "route-updates"
outgoing_queue_args = {
    "x-dead-letter-exchange": "route.exchange.dlx",
    "x-dead-letter-routing-key": "route-updates.dlq"
}

# --- Database Connection ---
client = AsyncIOMotorClient(MONGO_URI)
db = client['swift-logic']  # Use the correct database name from the URI
# --- UPDATED COLLECTION NAME ---
drivers_collection = db.drivers
processed_message_ids = set()
processed_message_lock = Lock()


class CircuitOpenError(RuntimeError):
    """Raised when route consumption is paused by the ROS circuit breaker."""


class RosCircuitBreaker:
    def __init__(self, failure_threshold=5, window_size=10, open_seconds=30):
        self.failure_threshold = failure_threshold
        self.window_size = window_size
        self.open_seconds = open_seconds
        self.failures = 0
        self.calls = 0
        self.opened_at = None
        self._half_open_probe = False

    def allow_call(self):
        if self.opened_at is None:
            return True
        if monotonic() - self.opened_at < self.open_seconds:
            return False
        if self._half_open_probe:
            return False
        self._half_open_probe = True
        return True

    def record_success(self):
        self.calls = 0
        self.failures = 0
        self.opened_at = None
        self._half_open_probe = False

    def record_failure(self):
        self.calls += 1
        self.failures += 1
        self._half_open_probe = False
        if self.calls >= self.window_size:
            self.calls = 0
            self.failures = 0
        if self.failures >= self.failure_threshold:
            self.opened_at = monotonic()

    def remaining_open_seconds(self):
        if self.opened_at is None:
            return 0
        return max(0, self.open_seconds - (monotonic() - self.opened_at))


ros_breaker = RosCircuitBreaker()


async def start_consumer():
    """Connects to RabbitMQ and starts the main consumer loop."""
    print("Attempting to connect to RabbitMQ...")
    while True:
        try:
            connection = pika.BlockingConnection(pika.URLParameters(RABBITMQ_URI))
            channel = connection.channel()

            channel.queue_declare(queue=INCOMING_QUEUE, durable=True, arguments=incoming_queue_args)
            channel.queue_declare(queue=OUTGOING_QUEUE, durable=True, arguments=outgoing_queue_args)
            print(f"RabbitMQ connected. Waiting for messages in '{INCOMING_QUEUE}'")

            for method_frame, properties, body in channel.consume(
                    INCOMING_QUEUE, inactivity_timeout=1):
                if method_frame is None:
                    if not ros_breaker.allow_call():
                        channel.cancel()
                        await asyncio.sleep(min(ros_breaker.remaining_open_seconds(), 5))
                        break
                    continue
                try:
                    await process_message(channel, method_frame, body)
                except CircuitOpenError:
                    channel.basic_nack(
                        delivery_tag=method_frame.delivery_tag, requeue=True)
                    channel.cancel()
                    await asyncio.sleep(min(ros_breaker.remaining_open_seconds(), 5))
                    break
                except Exception as e:
                    print(f"Error processing message: {e}")
                    channel.basic_nack(delivery_tag=method_frame.delivery_tag, requeue=False)

        except pika.exceptions.AMQPConnectionError:
            print("Connection to RabbitMQ failed. Retrying in 5 seconds...")
            await asyncio.sleep(5)


async def process_message(channel, method_frame, body):
    """Main logic for processing a single order message."""
    order_data = json.loads(body)
    order_id = order_data.get("orderId")
    message_id = order_data.get("messageId") or order_id
    with processed_message_lock:
        if message_id in processed_message_ids:
            channel.basic_ack(delivery_tag=method_frame.delivery_tag)
            return
    print(f"Received routing request for Order ID: {order_id}")

    # 1. Find an available driver from the 'drivers' collection.
    available_driver = await drivers_collection.find_one({"isAvailable": True})

    if not available_driver:
        raise Exception(f"No available drivers found for order {order_id}")
    else:
        print("Available driver:", available_driver)
    vehicle_id = available_driver["vehicleId"]
    driver_id = str(available_driver["_id"])
    print(f"Found available driver: {driver_id} with vehicle: {vehicle_id}")

    # 2. Call the ROS API (our mock). This demonstrates integrating heterogeneous systems (REST API).
    ros_payload = {
        "orderId": order_id,
        "vehicleId": vehicle_id,
        "pickup": {
            "fullAddress": "SwiftLogistics Central Warehouse",  # fixed pickup point
            "city": "Colombo",
            "postalCode": "00500"
        },
        "delivery": {
            "fullAddress": order_data.get("deliveryAddress"),
            "city": order_data.get("city"),
            "postalCode": order_data.get("postalCode")
        }
    }

    route_data = await call_ros_with_fallback(ros_payload)
    print(f"ROS API response: {route_data}")

    # 3. Publish the result back to the orchestrator.
    result_payload = json.dumps({
        "messageId": message_id,
        "orderId": order_id,
        "status": "ROUTED",
        "waypoints": route_data.get("waypoints"),
        "driverId": driver_id,
        "vehicleId": vehicle_id,
       "timestamp": datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    })
    channel.basic_publish(exchange='', routing_key=OUTGOING_QUEUE, body=result_payload)
    print(f"Published routing result for Order ID: {order_id}")

    # 4. Acknowledge the message was processed successfully.
    channel.basic_ack(delivery_tag=method_frame.delivery_tag)
    with processed_message_lock:
        processed_message_ids.add(message_id)


async def call_ros_with_retry(payload):
    last_error = None
    for attempt in range(4):
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(ROS_API_URL, json=payload, timeout=15.0)
                response.raise_for_status()
                return response.json()
        except httpx.TransportError as exc:
            last_error = exc
            if attempt == 3:
                break
            delay = 2 ** attempt
            print(f"Transient ROS network error; retrying in {delay}s: {exc}")
            await asyncio.sleep(delay)
    raise RuntimeError("ROS request failed after transient retries") from last_error


async def call_ros_with_fallback(payload):
    if not ros_breaker.allow_call():
        raise CircuitOpenError("ROS circuit is open")
    try:
        route_data = await call_ros_with_retry(payload)
        ros_breaker.record_success()
        return route_data
    except (httpx.HTTPError, RuntimeError) as exc:
        ros_breaker.record_failure()
        if ros_breaker.opened_at is not None:
            print("ROS circuit opened; pausing route queue consumption")
        else:
            print(f"ROS unavailable; using local route heuristic: {exc}")
        return local_route_heuristic(payload)


def local_route_heuristic(payload):
    delivery = payload.get("delivery", {})
    city = delivery.get("city") or "UNKNOWN"
    zone = zone_for_city(city)
    return {
        "routeId": f"local-{payload.get('orderId')}",
        "orderId": payload.get("orderId"),
        "vehicleId": payload.get("vehicleId"),
        "status": "ROUTED",
        "waypoints": ["Colombo", zone, city],
        "source": "LOCAL_HEURISTIC"
    }


def zone_for_city(city):
    normalized_city = city.lower()
    zones = {
        "colombo": "Colombo Central",
        "dehiwala": "Colombo South",
        "mount lavinia": "Colombo South",
        "kaduwela": "Colombo East",
        "malabe": "Colombo East",
        "kottawa": "Colombo South",
        "kadawatha": "Colombo North",
        "negombo": "Western North",
        "gampaha": "Western North"
    }
    return zones.get(normalized_city, "Western Province")
