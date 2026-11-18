# Driver App

The courier's web app: sign in, see assigned deliveries, start a trip, stream GPS telemetry, and capture
proof of delivery. React 19 (Create React App), STOMP.js, Leaflet. Served on port **3001**.

## Features

- Driver sign in / sign up; the session stores the JWT and survives a refresh. Signing out marks the driver
  unavailable on the server.
- Guided flow: **1. Start Delivery Trip** (marks the order in transit and starts the GPS simulator) then
  **2. Complete Delivery** (signature and optional photo) or **Report Failure** (with a reason).
- Proof of delivery requires a drawn signature; the form resets for every order, reports server errors in
  place, and cannot be submitted twice.
- Telemetry over STOMP (`/ws`, destination `/app/telemetry`). While the route simulator runs, raw browser
  geolocation is not published, so the customer's map never jumps between real and simulated positions.
- The delivery list refreshes every 5 s and keeps its last known content if a refresh fails.
- Responsive layout and keyboard-accessible dialogs.

## Running

With the whole stack (recommended):

```bash
cd ../../infra && docker compose up --build -d     # http://localhost:3001
```

Demo logins: `driver1@swift.lk` / `driver2@swift.lk`, password `password123` (the *Fill Demo Driver* button
fills the first).

The API and WebSocket addresses are baked in at **build time** through the `REACT_APP_API_BASE_URL` and
`REACT_APP_WS_URL` build arguments (defaults `http://localhost:8080/api/v1` and `ws://localhost:8080/ws`).
For development with hot reload (Node 20): `npm ci && npm start` and copy `.env.example` to `.env`.

## Build and test

```bash
docker run --rm -v "$PWD":/app -w /app -e CI=true node:20-slim \
  sh -c 'npm ci && npm run build && npm test -- --watchAll=false'
```

`CI=true` makes the build fail on any lint warning. Tests cover the proof-of-delivery modal (canvas
signature, validation, per-order reset), the delivery flow (starting the chosen order, poll errors, GPS
pause, logout) and the login/sign-up screens.

## Structure

```
src/
  App.js                       dashboard, simulator, delivery actions
  components/                  NextDeliveryCard, DeliveriesList, DeliveryItem, CurrentLocationCard,
                               LiveDeliveryMap, ProofOfDeliveryModal, AuthPage, Login, SignUp
  context/AuthContext.js       session state
  hooks/useModalA11y.js        Escape handling and focus management for dialogs
  network/                     fetch client, driver and auth endpoints, STOMP hook
  utils/geo.js                 destination lookup and HTML escaping for map popups
```
