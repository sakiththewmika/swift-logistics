import os
import threading
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI

from wms.mssg_parser import parse_string_to_dict, parse_dict_to_string
from rabbitmq.client import RabbitMQClient
from wms.client import WMSClient

wms_client = WMSClient()
rabbitmq_client = RabbitMQClient()

# TODO: secure the .env file
dotenv_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path)

app = FastAPI()


@app.get("/health")
def health():
    return {"status": "ok", "service": "WMS Adapter"}

def handle_message(message):
    parsed_mssg = parse_string_to_dict(message)
    parsed_mssg["messageId"] = str(uuid.uuid4())
    print(f"[WMS-ADAPTER] Parsed WMS message: {parsed_mssg}")
    # publish_to_queue("wms", parsed_mssg)
    rabbitmq_client.publish("warehouse-updates", parsed_mssg)

def handle_compensation(message):
    parsed_message = parse_string_to_dict(message)
    if parsed_message.get("status") != "PACKAGE_RELEASED":
        raise ValueError(f"Unexpected WMS compensation response: {message}")
    rabbitmq_client.publish("warehouse-updates", {
        "messageId": str(uuid.uuid4()),
        "orderId": parsed_message["orderId"],
        "status": "PACKAGE_RELEASED"
    })

def process_order(message):
    parsed_order = parse_dict_to_string(message)
    wms_client.send_order(parsed_order)

def process_compensation(message):
    order_id = message.get("orderId")
    if not order_id:
        raise ValueError("Warehouse compensation message is missing orderId")
    wms_client.cancel_package(order_id)


def start_wms_listener():
    wms_listener = threading.Thread(target=wms_client.listen_for_updates, args=(handle_message, ))
    wms_listener.daemon = True
    wms_listener.start()

    consumer = threading.Thread(target=rabbitmq_client.consume, args=("warehouse-queue", process_order))
    consumer.daemon = True
    consumer.start()
    compensation_consumer = threading.Thread(
        target=rabbitmq_client.consume,
        args=("warehouse-compensation", process_compensation)
    )
    compensation_consumer.daemon = True
    compensation_consumer.start()

@app.on_event("startup")
def startup_event():
    start_wms_listener()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
    # start_wms_listener()