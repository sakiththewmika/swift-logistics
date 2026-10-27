import json
import os
import socket
from urllib.request import Request, urlopen


CONSUL_URL = (
    f"http://{os.getenv('CONSUL_HOST', 'consul')}:{os.getenv('CONSUL_PORT', '8500')}"
)


def register_service(service_id, service_name, port, health_port=None, tcp_check=False):
    address = socket.gethostname()
    check_port = health_port or port
    payload = {
        "ID": service_id,
        "Name": service_name,
        "Address": address,
        "Port": port,
        "Tags": ["swift-logistics", "python"],
        "Check": {
            ("TCP" if tcp_check else "HTTP"): (
                f"{address}:{port}" if tcp_check else f"http://{address}:{check_port}/health"
            ),
            "Interval": "10s",
            "Timeout": "3s",
            "DeregisterCriticalServiceAfter": "1m",
        },
    }
    request = Request(
        f"{CONSUL_URL}/v1/agent/service/register",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="PUT",
    )
    with urlopen(request, timeout=5):
        return


def discover_service(service_name):
    request = Request(
        f"{CONSUL_URL}/v1/health/service/{service_name}?passing=true"
    )
    with urlopen(request, timeout=3) as response:
        services = json.load(response)
    if not services:
        raise RuntimeError(f"No healthy Consul instances for {service_name}")
    service = services[0]["Service"]
    return service["Address"], service["Port"]
