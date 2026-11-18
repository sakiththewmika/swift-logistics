# CMS Adapter Service

Translates between the platform's RabbitMQ bus and the legacy **Client Management System** (billing),
which speaks SOAP/XML. Spring Boot 3.5, Java 21, Spring-WS, Resilience4j.

## What it does

| Direction | Queue | Action |
|---|---|---|
| in | `order-created` | Calls SOAP `SubmitOrder`; publishes `BILLED` / `FAILED` / `PENDING` to `billing-updates` |
| in | `billing-compensation` | Calls SOAP `CancelOrderBilling` (refund); publishes `BILLING_REFUNDED` |
| in | `billing-rollback` | legacy queue with no producer; same refund handling |
| out | `billing-updates` (exchange `billing-updates.exchange`, key `billing.updated`) | results for the orchestrator |

## Resilience

- **Circuit breaker** (`cmsSoapBreaker`): window 10, at least 5 calls, 50 % failure rate, open for 30 s,
  2 half-open calls; each call is limited to 4 s.
- **Retries:** transport failures and timeouts are retried 4 times (1 s, 2 s, 4 s back-off). When they are
  exhausted a `@Recover` handler publishes a `FAILED` billing update and acknowledges the message, so the
  order ends in `BILLING_FAILED` instead of staying in `NEW`. Permanent SOAP failures fail immediately.
- **Open circuit:** the message is held for `cms.circuit-open-requeue-delay-ms` (default 5000) and requeued,
  so the consumer does not spin; the order waits and continues once the CMS is back.
- **Idempotency:** `processed_messages` in MongoDB, keyed `orderId:CMS_BILLING` / `orderId:CMS_REFUND`.
- **Dead-lettering:** failed messages go to the queue's `.dlq` rather than being requeued forever.

The SOAP endpoint is fixed in `SoapClientConfig` as `http://cms-mock-service:5001/ws` (the compose
container name); it is not discovered through Consul.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `SERVER_PORT` | `8001` | HTTP port (`GET /health`, actuator) |
| `MONGODB_URI` | `mongodb://mongo:27017/swift-logic?replicaSet=rs0` | de-duplication store |
| `RABBITMQ_HOST`, `RABBITMQ_PORT`, `RABBITMQ_USERNAME`, `RABBITMQ_PASSWORD` | `rabbitmq`, `5672`, `guest` | broker |
| `CONSUL_HOST`, `CONSUL_PORT` | `consul`, `8500` | registry |
| `resilience4j.*.cmsSoapBreaker.*` | see `application.properties` | breaker and time limit |

## Running and testing

Run with the whole stack: `cd ../../infra && docker compose up --build -d`.

Tests (no broker, database or CMS needed; the context test uses the hermetic `test` profile):

```bash
docker run --rm -v "$PWD":/app -w /app maven:3.9.9-eclipse-temurin-21 mvn -B test
```

The SOAP client classes are generated from `src/main/resources/wsdl/orderService.wsdl` during the build.
