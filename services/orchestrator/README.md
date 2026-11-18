# Orchestrator Service

The core of the platform. It exposes the REST API, owns the order state, runs the saga that drives an
order through billing (CMS), warehouse (WMS) and routing (ROS), pushes live updates to the front-ends,
and enforces security. Spring Boot 3.2, Java 21, MongoDB, RabbitMQ.

## Responsibilities

- Create orders idempotently and write the outgoing command to a **transactional outbox**; a relay
  publishes it to RabbitMQ.
- Consume billing, warehouse and route results and advance the order through a guarded **state machine**
  (late or duplicate messages are ignored); start **compensation** when a step fails.
- Reserve and release drivers as orders are routed and finished.
- Stream status changes over **SSE** and receive/forward driver telemetry over **STOMP**.
- Authenticate customers and drivers (BCrypt, JWT) and authorise access per resource.

See [docs/architecture.md](../../docs/architecture.md) for lifecycle, topology and patterns.

## Running

Preferred: the whole stack with Docker Compose.

```bash
cd ../../infra && docker compose up --build -d
```

The service listens on **8000** in the container (published on host ports 8000 and 8080).

To run it on its own you need MongoDB (a replica set, because transactions are used) and RabbitMQ:

```bash
cp .env.example .env      # then adjust MONGODB_URI and RABBITMQ_*
./mvnw spring-boot:run
```

Build and test in a container, without a local JDK:

```bash
docker run --rm -v "$PWD":/app -w /app maven:3.9.9-eclipse-temurin-21 mvn -B test
```

The Spring context test runs under the hermetic `test` profile (`src/test/resources/application-test.properties`):
it needs no database or broker and cannot reach one.

## Configuration

| Setting | Env var | Default | Purpose |
|---|---|---|---|
| `server.port` | `SERVER_PORT` | `8000` | HTTP port |
| `spring.data.mongodb.uri` | `MONGODB_URI` | `mongodb://mongo:27017/swift-logic?replicaSet=rs0` | database |
| `spring.rabbitmq.host/port` | `RABBITMQ_HOST`, `RABBITMQ_PORT` | `rabbitmq`, `5672` | broker |
| `spring.rabbitmq.username/password` | `RABBITMQ_USERNAME`, `RABBITMQ_PASSWORD` | `guest` | broker credentials |
| `spring.cloud.consul.host/port` | `CONSUL_HOST`, `CONSUL_PORT` | `consul`, `8500` | registry |
| `app.security.require-jwt` | `REQUIRE_JWT` | `true` | require a bearer token on protected routes |
| `jwt.secret`, `jwt.expiration-ms` | `JWT_SECRET`, `JWT_EXPIRATION_MS` | built-in demo key, 24 h | token signing (**set your own** outside a demo) |
| `app.cors.allowed-origins` | — | `http://localhost:3000,http://localhost:3001` | allowed browser origins |
| `app.seed.enabled` | — | `true` | seed demo customers, drivers and orders on an empty database |
| `app.outbox.relay.enabled` | — | `true` | run the outbox relay |
| `JAVA_OPTS` | `JAVA_OPTS` | — | extra JVM options in Docker |

## API

Base path `/api/v1`; interactive docs at `/swagger-ui.html`. Protected routes need
`Authorization: Bearer <token>` from a login endpoint. Errors are JSON `{"message": "..."}`.

| Method | Endpoint | Access |
|---|---|---|
| `POST` | `/auth/customer`, `/auth/driver` | public — body `{"username","password"}`, returns the account plus `token` |
| `POST` | `/auth/sign-up` | public — `customerName`, `customerEmail`, `password`, optional `phone` |
| `POST` | `/auth/driver-sign-up` | public — `driverName`, `password`, `vehicleId`; optional `driverEmail`, `name`, `type` |
| `POST` | `/auth/driver-logout` | public — body `{"username"}`; marks the driver unavailable |
| `POST` | `/orders` | customer — header `Idempotency-Key` required; `customerId` must be your own |
| `GET` | `/orders/{orderId}`, `/orders/{orderId}/events` | the order's customer or assigned driver |
| `GET` | `/orders/customer/{customerId}` | that customer |
| `GET` | `/orders/health` | public |
| `GET` | `/drivers/driver/{driverId}` | that driver |
| `GET` | `/drivers/orders/{orderId}` | the assigned driver |
| `PUT` | `/drivers/driver/start/{orderId}`, `/drivers/driver/complete/{orderId}` | the assigned driver (`409` if the order is in the wrong state) |
| `POST` | `/drivers/driver/{driverId}/orders/{orderId}/pod` | that driver — `status` `DELIVERED` (the Driver App requires a signature) or `FAILED` (needs `failureReason`); `409` if the order is already finished |
| `POST` | `/recovery/replay?queue=<name>.dlq&limit=10` | customer or admin; `limit` 1–100 |
| `GET` | `/sse/order/{orderId}` (no `/api/v1`) | public event stream |
| — | `/ws` (STOMP; send to `/app/telemetry`) | public handshake |

### Example

```bash
# Sign in as the demo customer
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/customer \
  -H 'Content-Type: application/json' \
  -d '{"username":"client@swift.lk","password":"password123"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')

# Create an order
curl -X POST http://localhost:8080/api/v1/orders \
  -H "Authorization: Bearer $TOKEN" -H 'Idempotency-Key: demo-1' -H 'Content-Type: application/json' \
  -d '{"customerId":"cust-001","deliveryAddress":"42 Galle Road, Colombo 03","city":"Colombo","postalCode":"00300","country":"Sri Lanka","totalAmount":18500}'
```

## Code layout

```
src/main/java/com/swiftlogistics/orchestrator/
  config/        RabbitMQ topology, CORS, Mongo transactions, WebSocket, seeder, JSON error handler
  controller/    Auth, Order, Driver, Recovery, SSE, Telematics (STOMP)
  dto/           request and message payloads (validated)
  messaging/
    publisher/   outbox relay, SSE publisher
    subscriber/  billing, warehouse and route result listeners
  model/         MongoDB documents and enums (OrderStatus, EventType, ...)
  repository/    Spring Data repositories
  security/      JwtService, JwtAuthenticationFilter, AccessGuard (role and ownership checks)
  service/       OrderService, OrderStateMachine, DriverService, RouteService, RecoveryService, EventService
```
