import os
import socket

import httpx


CONSUL_URL = (
    f"http://{os.getenv('CONSUL_HOST', 'consul')}:{os.getenv('CONSUL_PORT', '8500')}"
)


async def register_service(service_id, service_name, port, health_port=None):
    address = socket.gethostname()
    check_port = health_port or port
    payload = {
        "ID": service_id,
        "Name": service_name,
        "Address": address,
        "Port": port,
        "Tags": ["swift-logistics", "python"],
        "Check": {
            "HTTP": f"http://{address}:{check_port}/health",
            "Interval": "10s",
            "Timeout": "3s",
            "DeregisterCriticalServiceAfter": "1m",
        },
    }
    async with httpx.AsyncClient() as client:
        response = await client.put(
            f"{CONSUL_URL}/v1/agent/service/register", json=payload, timeout=5
        )
        response.raise_for_status()


async def discover_service(service_name):
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{CONSUL_URL}/v1/health/service/{service_name}",
            params={"passing": "true"},
            timeout=3,
        )
        response.raise_for_status()
    services = response.json()
    if not services:
        raise RuntimeError(f"No healthy Consul instances for {service_name}")
    service = services[0]["Service"]
    return service["Address"], service["Port"]
