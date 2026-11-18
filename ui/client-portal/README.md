# Client Portal

The customer-facing web app: place orders, follow them through the saga, watch the delivery on a live
map, and (for demos) trigger failure scenarios from the Ops console. React 19 (Create React App),
Leaflet, lucide-react. Served on port **3000**.

## Features

- Sign in / sign up (JWT kept in `localStorage`); the order list and KPIs load for the signed-in customer.
- Master-detail view: searchable, filterable order list; details with a stage stepper, driver and amount,
  proof of delivery, and the audit trail. The layout collapses to one column below 1024 px.
- Live updates over Server-Sent Events (`/sse/order/{id}`) with automatic reconnect; the list also refreshes
  every 4 s while any order can still change.
- Live driver position on a Leaflet map (OpenStreetMap tiles).
- **Middleware Ops & Chaos** console: happy-path order, duplicate-key idempotency test, rollback test
  (`[FAIL_ROUTE]`) and dead-letter replay. If nobody is signed in it signs in as the demo customer
  (`client@swift.lk`).
- Keyboard-accessible dialogs (Escape closes), labelled controls and a polite live region for notifications.

## Running

With the whole stack (recommended):

```bash
cd ../../infra && docker compose up --build -d     # http://localhost:3000
```

The API address is baked in at **build time**. Change it with the `REACT_APP_API_BASE_URL` build argument
(default `http://localhost:8080/api/v1`); the SSE URL is derived from it.

For development with hot reload (needs Node 20): `npm ci && npm start`, which serves on port 3000 and talks to
the API at `REACT_APP_API_BASE_URL`.

## Build and test

```bash
docker run --rm -v "$PWD":/app -w /app -e CI=true node:20-slim \
  sh -c 'npm ci && npm run build && npm test -- --watchAll=false'
```

`CI=true` makes the build fail on any lint warning. Tests use Jest and Testing Library; they cover the
modals, order list, `OrderDetails`, the SSE client, polling, the Ops console and accessibility behaviour.

## Structure

```
src/
  App.js                 portal shell, polling, notifications, KPIs
  components/            OrderList, OrderDetails, OrderStepper, AuditTimeline, LiveDeliveryMap,
                         CreateOrderModal, SignIn/SignUp, SystemOpsModal, Toast, Notification*
  context/AuthContext.js session state
  hooks/useModalA11y.js  Escape handling and focus management for dialogs
  network/               fetch client, order and auth endpoints, SSE client
  utils/geo.js           destination lookup and HTML escaping for map popups
```
