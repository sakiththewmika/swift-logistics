import os
import threading
import time
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI

from wms.mssg_parser import parse_string_to_dict, parse_dict_to_string
from rabbitmq.client import RabbitMQClient, emit_zipkin_span
from wms.client import WMSClient
from consul import register_service

# Settings from .env must be in the environment before the clients read them.
dotenv_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path, override=False)

wms_client = WMSClient()
rabbitmq_client = RabbitMQClient()

# Request context per order, written by the RabbitMQ consumer threads and consumed by the WMS listener thread.
correlation_ids_by_order = {}
correlation_lock = threading.Lock()
CORRELATION_TTL_SECONDS = 3600

app = FastAPI()


@app.get("/health")
def health():
    return {"status": "ok", "service": "WMS Adapter"}

def get_correlation_id(properties):
    if properties is None:
        return None
    headers = properties.headers or {}
    return headers.get("X-Correlation-Id") or headers.get("x-correlation-id") or properties.correlation_id

def handle_message(message):
    parsed_mssg = parse_string_to_dict(message)
    parsed_mssg["messageId"] = str(uuid.uuid4())
    print(f"[WMS-ADAPTER] Parsed WMS message: {parsed_mssg}")
    with correlation_lock:
        context = correlation_ids_by_order.pop(parsed_mssg.get("orderId"), {})
    correlation_id = context.get("correlation_id")
    headers = context.get("headers", {})
    start_time_us = context.get("start_time_us", time.time_ns() // 1000)
    traceparent = emit_zipkin_span(
        "wms-adapter",
        "wms.process",
        headers,
        correlation_id,
        start_time_us,
        (time.time_ns() // 1000) - start_time_us,
    )
    rabbitmq_client.publish(
        "warehouse-updates",
        parsed_mssg,
        correlation_id,
        {**headers, "traceparent": traceparent},
    )

def handle_compensation(message, properties=None):
    parsed_message = parse_string_to_dict(message)
    if parsed_message.get("status") != "PACKAGE_RELEASED":
        raise ValueError(f"Unexpected WMS compensation response: {message}")
    headers = dict((properties.headers if properties else {}) or {})
    traceparent = emit_zipkin_span(
        "wms-adapter",
        "wms.compensation",
        headers,
        get_correlation_id(properties),
        time.time_ns() // 1000,
        1,
    )
    rabbitmq_client.publish("warehouse-updates", {
        "messageId": str(uuid.uuid4()),
        "orderId": parsed_message["orderId"],
        "status": "PACKAGE_RELEASED"
    }, get_correlation_id(properties), {**headers, "traceparent": traceparent})

def remember_context(order_id, properties):
    """Stores trace context for the WMS reply; entries the WMS never answered are dropped after an hour."""
    now = time.time()
    with correlation_lock:
        for key in [k for k, v in correlation_ids_by_order.items()
                    if now - v.get("stored_at", now) > CORRELATION_TTL_SECONDS]:
            del correlation_ids_by_order[key]
        correlation_ids_by_order[order_id] = {
            "correlation_id": get_correlation_id(properties),
            "headers": dict((properties.headers if properties else {}) or {}),
            "start_time_us": time.time_ns() // 1000,
            "stored_at": now,
        }


def process_order(message, properties=None):
    remember_context(message.get("orderId"), properties)
    parsed_order = parse_dict_to_string(message)
    wms_client.send_order(parsed_order)

def process_compensation(message, properties=None):
    order_id = message.get("orderId")
    if not order_id:
        raise ValueError("Warehouse compensation message is missing orderId")
    remember_context(order_id, properties)
    wms_client.cancel_package(order_id)


def start_wms_listener():
    # The listener and both consumers reconnect on their own, so a WMS or broker restart never
    # leaves the adapter silently deaf while /health still reports ok.
    threading.Thread(target=wms_client.listen_for_updates, args=(handle_message,), daemon=True).start()
    threading.Thread(target=rabbitmq_client.consume_forever,
                     args=("warehouse-queue", process_order), daemon=True).start()
    threading.Thread(target=rabbitmq_client.consume_forever,
                     args=("warehouse-compensation", process_compensation), daemon=True).start()

@app.on_event("startup")
def startup_event():
    try:
        register_service("wms-adapter", "wms-adapter", 8003)
        register_service("wms-mock", "wms-mock", 9000, tcp_check=True)
        wms_client.refresh_endpoint()
        print("[CONSUL] Registered WMS adapter and WMS service.")
    except Exception as exc:
        print(f"[CONSUL] Registration unavailable; continuing with fallback: {exc}")
    start_wms_listener()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
    # start_wms_listener()