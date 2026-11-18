# WMS Adapter Service

Translates between the platform's RabbitMQ bus and the legacy **Warehouse Management System**, which
speaks a simple newline-delimited **TCP** protocol. Python 3.11 with pika and FastAPI; the adapter uses
threads (not asyncio). A mock WMS server runs in the same container for local use.

## Message flow

| Direction | Queue | Action |
|---|---|---|
| in | `warehouse-queue` | sends `<orderId>:<status>` (status `BILLED`) to the WMS |
| in | `warehouse-compensation` | sends `CANCEL_PACKAGE|<orderId>` |
| out | `warehouse-updates` | `{messageId, orderId, status}` for each reply: `READY` or `PACKAGE_RELEASED`, or `FAILED` |

TCP protocol (one message per line, `\n` terminated): the adapter sends `ORD:BILLED` and
`CANCEL_PACKAGE|ORD`; the WMS answers `ORD:READY` and `PACKAGE_RELEASED|ORD`. The mock takes 3 s to
package an order and 1 s to release one.

## Resilience

- Lazy connect: nothing connects at import; the first send or the listener opens the socket.
- One socket guarded by a lock; frames are never interleaved.
- The listener buffers bytes and handles only complete lines, so a message split across TCP segments is
  reassembled; it reconnects with back-off after any disconnect, and a failing handler never ends it.
- Sends are retried 4 times (1 s, 2 s, 4 s) with a reconnect between attempts.
- Consumer threads are supervised and restart after broker errors; unreadable messages are dead-lettered.
- When packaging retries are exhausted (or the failure is permanent) the adapter publishes
  `{status: FAILED}` to `warehouse-updates`, so the orchestrator refunds the order instead of leaving it
  stuck, and then dead-letters the message.
- De-duplication in SQLite (`DEDUP_DB_PATH`), keyed `orderId:WMS_PACKAGING` / `orderId:WMS_COMPENSATION`;
  a row left in `PROCESSING` by a crashed attempt is reclaimed after `DEDUP_STALE_SECONDS` (60).
- The TCP protocol has no acknowledgement: an update that arrives while RabbitMQ is down is logged and lost.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `RABBITMQ_HOST`, `RABBITMQ_PORT`, `RABBITMQ_USER`, `RABBITMQ_PASS` | `swift-rabbitmq`, `5672`, `guest` | broker |
| `WMS_TCP_HOST`, `WMS_TCP_PORT` | `localhost`, `9000` | WMS address when Consul has no entry |
| `WMS_SERVICE_NAME` | `wms-mock` | Consul service name |
| `CONSUL_HOST`, `CONSUL_PORT` | `consul`, `8500` | discovery |
| `DEDUP_DB_PATH`, `DEDUP_STALE_SECONDS` | `/tmp/swift-wms-dedup.db`, `60` | de-duplication |
| `ZIPKIN_ENDPOINT` | `http://zipkin:9411/api/v2/spans` | span export |

Copy `app/.env.example` to `app/.env` for local overrides (git-ignored).

## Running and testing

With the whole stack: `cd ../../infra && docker compose up --build -d`. The container starts the mock
WMS (port 9000), then the adapter on port **8003** (`GET /health`).

Tests (no broker or WMS needed; the socket tests use real local sockets):

```bash
docker run --rm -e DEDUP_DB_PATH=:memory: -e PYTHONDONTWRITEBYTECODE=1 \
  -v "$PWD/../..":/repo:ro -w /repo python:3.11-slim \
  python -m unittest discover -s services/wms-adapter/test -p "test_*.py"
```

Layout: `app/main.py` (wiring, FastAPI), `app/rabbitmq/client.py` (consume/publish, de-duplication),
`app/wms/client.py` (TCP client), `app/wms/mssg_parser.py` (line parsing), `app/wms_server_mock.py` (mock WMS).
