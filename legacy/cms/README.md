# Legacy CMS (mock)

A stand-in for the legacy **Client Management System**: a SOAP/XML billing service. Spring Boot with
Spring-WS, Java 21. It keeps no state and always succeeds, which makes it a predictable back-end for
demonstrating the adapter and the saga.

## Endpoints

Port **5001** (set `SERVER_PORT` to change it).

- SOAP service: `http://localhost:5001/ws`
- WSDL: `http://localhost:5001/ws/orders.wsdl`

| Operation | Behaviour |
|---|---|
| `SubmitOrderRequest` | returns status `BILLED` with the requested amount |
| `CancelOrderBillingRequest` | returns status `BILLING_REFUNDED` |
| `CancelInvoiceRequest` | returns status `CANCELLED_REFUNDED` |

The contract is defined in `src/main/resources/wsdl/OrderService.xsd`.

## Running

With the whole stack (service `cms`, container `cms-mock-service`):

```bash
cd ../../infra && docker compose up --build -d
```

On its own:

```bash
docker build -t cms-mock .
docker run --rm -p 5001:5001 cms-mock
```

The image is a multi-stage build: Eclipse Temurin JDK 21 compiles it, a JRE 21 image runs it.
`JAVA_OPTS` passes JVM options.

## Testing

```bash
docker run --rm -v "$PWD":/app -w /app maven:3.9.9-eclipse-temurin-21 mvn -B test
```

To try the CMS outage behaviour of the platform, stop this container (`docker stop cms-mock-service`)
and create an order: the CMS adapter retries, then fails billing, or waits behind its circuit breaker.
