import asyncio
from fastapi import FastAPI
from consumer import start_consumer
from consul import register_service

app = FastAPI(title="ROS Integration Service", version="1.0.0")

@app.on_event("startup")
async def startup_event():
    """On startup, create a background task to run the RabbitMQ consumer."""
    print("Service starting up...")
    asyncio.create_task(asyncio.to_thread(asyncio.run, start_consumer()))
    print("Consumer task scheduled to run.")
    try:
        await register_service("ros-integration", "ros-integration", 8004)
        await register_service("ros-mock", "ros-mock", 3001, health_port=8004)
        print("Registered ROS adapter and route service with Consul.")
    except Exception as exc:
        print(f"Consul registration unavailable; continuing with fallback: {exc}")

@app.get("/health", tags=["Monitoring"])
def health_check():
    """A simple health check endpoint for monitoring."""
    return {"status": "healthy", "service": "ROS Integration"}