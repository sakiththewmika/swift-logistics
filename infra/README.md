# Infrastructure

`docker-compose.yml` runs the whole platform on one bridge network (`swift-network`).

## Commands

Run from this directory.

```bash
docker compose up --build -d       # build images and start everything
docker compose ps                  # services with a healthcheck show (healthy)
docker compose logs -f orchestrator
docker compose down                # stop, keep data
docker compose down -v             # stop and delete all data (clean demo database)
```

The first build downloads Maven and npm dependencies and takes several minutes.

## Services

| Service (container) | Image / build | Host port | Healthcheck |
|---|---|---|---|
| `consul` (`consul-registry`) | `hashicorp/consul:1.18` | 8500, 8600/udp | `consul members` |
| `zipkin` (`zipkin-tracing`) | `openzipkin/zipkin` | 9411 | — |
| `mongo` (`swift-mongo`) | `mongo:7`, replica set `rs0` | 127.0.0.1:27017 | replica-set status (initialises the set on first start) |
| `rabbitmq` (`swift-rabbitmq`) | `rabbitmq:3.12-management` | 127.0.0.1:5672, 127.0.0.1:15672 | `rabbitmq-diagnostics ping` |
| `orchestrator` (`swift-orchestrator`) | `services/orchestrator` | 8000 and 8080 (both → container 8000) | `GET /api/v1/orders/health` |
| `cms` (`cms-mock-service`) | `legacy/cms` | 127.0.0.1:5001 | TCP listener on 5001 |
| `cms-adapter` (`swift-cms-adapter`) | `services/cms-adapter` | 8001 | `GET /health` |
| `wms-adapter` (`swift-wms-adapter`) | `services/wms-adapter` | 8003 | `GET /health` |
| `ros-integration` (`swift-ros-integration`) | `services/ros-integration` | 8004 | `GET /health` |
| `client-portal` (`swift-client-portal`) | `ui/client-portal` | 3000 | — |
| `driver-app` (`swift-driver-app`) | `ui/driver-app` | 3001 | — |

The WMS mock (TCP 9000) and ROS mock (HTTP 3001, inside the container) run in the same containers as
their adapters and are not published to the host.

## Start-up order

`mongo`, `rabbitmq` and `consul` must be healthy before the orchestrator and the adapters start; the
CMS adapter also waits for the CMS mock; both UIs wait for a healthy orchestrator.

## Volumes

| Volume | Holds |
|---|---|
| `mongo_data` | MongoDB data |
| `rabbitmq_data` | RabbitMQ data |
| `orchestrator_logs` | orchestrator log directory |
| `wms_dedup_data`, `ros_dedup_data` | the adapters' SQLite de-duplication databases |

## Configuration

- Each service can read an optional `.env` file next to it (`services/<name>/.env`, and
  `services/wms-adapter/app/.env`). Copy the matching `.env.example`. These files are git-ignored and
  are overridden by the `environment:` entries in the compose file, so the stack always talks to the
  containers above, whatever a local `.env` contains.
- The UIs are static builds: `REACT_APP_API_BASE_URL` and `REACT_APP_WS_URL` are **build arguments**
  (defaults `http://localhost:8080/api/v1` and `ws://localhost:8080/ws`). To change them:

  ```bash
  REACT_APP_API_BASE_URL=http://my-host:8080/api/v1 REACT_APP_WS_URL=ws://my-host:8080/ws docker compose up --build -d
  ```

  The orchestrator only accepts browser requests from `http://localhost:3000` and `http://localhost:3001`
  unless `app.cors.allowed-origins` is changed.
- `REQUIRE_JWT` (default `true`) and `JWT_SECRET` configure API security; see
  [docs/architecture.md](../docs/architecture.md#7-security).
- `ENABLE_CHAOS_HOOKS` (ROS adapter, default `true`) enables the `[FAIL_ROUTE]` demo failure trigger.

## Troubleshooting

| Symptom | Check |
|---|---|
| A service stays `starting` | `docker compose logs <service>`; the Spring services need up to ~40 s |
| Orders stay in `NEW` | `cms-adapter` logs; with the CMS down the order waits (circuit open) or ends in `BILLING_FAILED` |
| Orders stop at `BILLED` | `wms-adapter` logs and the `warehouse-queue` / `warehouse-queue.dlq` queues in the RabbitMQ UI |
| Orders stop at `READY` | `ros-integration` logs and the `route-planning` queues |
| Messages in a `.dlq` | replay with `POST /api/v1/recovery/replay?queue=<name>.dlq` or from the Ops console |
| Port already in use | stop the other process or change the host side of `ports:` |
