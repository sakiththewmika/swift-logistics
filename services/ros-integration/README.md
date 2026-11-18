# ROS Integration Service

Adapter between the platform's RabbitMQ bus and the Route Optimisation System (ROS), a REST service
(mocked inside this container for local use). Python 3.11, FastAPI, pika, Motor.

## What it does

1. Consumes route requests from the `route-planning` queue.
2. Picks a driver from MongoDB (`drivers`): the first with `isAvailable = true`, otherwise any driver.
3. Calls the ROS `POST /optimize-route` (discovered through Consul as `ros-mock`, falling back to
   `ROS_API_URL`).
4. Publishes the result (`ROUTED` with waypoints, driver and vehicle, or `FAILED`) to `route-updates`.

## Resilience

- **Circuit breaker:** 5 failures open it for 30 s. While open, messages are requeued and consumption
  pauses, so orders are not failed (or refunded) just because the ROS is down. After 30 s a single
  probe request is allowed through.
- **Fallback:** when the ROS cannot be reached the adapter returns a local heuristic route
  (`[Colombo, <zone>, <city>]`) and still reports `ROUTED`.
- **Retries:** 4 attempts with exponential back-off on transport errors.
- **De-duplication:** SQLite (`DEDUP_DB_PATH`) keyed by `orderId:ROS_ROUTING`; a row left in `PROCESSING` by a
  crashed attempt is reclaimed after `DEDUP_STALE_SECONDS` (default 60).
- **Connections:** the consumer reconnects after any broker error and always closes its connection.

## Demo failure trigger

A delivery address containing `[FAIL_ROUTE]` makes the adapter report `FAILED`, which drives the saga's
rollback path (Ops console, Scenario C). Controlled by `ENABLE_CHAOS_HOOKS` (default `true`); set it to
`false` to ignore the marker.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `RABBITMQ_URI` / `RABBITMQ_HOST` | `amqp://guest:guest@rabbitmq:5672/` | broker |
| `MONGO_URI` | `mongodb://mongo:27017/swift-logic?replicaSet=rs0` | driver lookup |
| `ROS_API_URL` | `http://127.0.0.1:3001/optimize-route` | ROS endpoint when Consul has no entry |
| `CONSUL_HOST`, `CONSUL_PORT` | `consul`, `8500` | discovery |
| `ENABLE_CHAOS_HOOKS` | `true` | honour `[FAIL_ROUTE]` |
| `DEDUP_DB_PATH`, `DEDUP_STALE_SECONDS` | `/tmp/swift-ros-dedup.db`, `60` | de-duplication |
| `ADAPTER_PORT` | `8002` (compose sets `8004`) | adapter HTTP port |
| `ZIPKIN_ENDPOINT` | `http://zipkin:9411/api/v2/spans` | span export |

## Running

With the rest of the stack: `docker compose up --build -d` from `infra/`. The container starts the
mock ROS (port 3001) and then the adapter (`/health` on `ADAPTER_PORT`).

Tests (no broker or database needed):

```bash
docker run --rm -e DEDUP_DB_PATH=:memory: -e PYTHONDONTWRITEBYTECODE=1 \
  -v "$PWD/../..":/repo:ro -w /repo python:3.11-slim \
  python -m unittest discover -s services/ros-integration/test -p "test_*.py"
```
