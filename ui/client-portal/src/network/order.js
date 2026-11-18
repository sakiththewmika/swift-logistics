import NETWORK from './network';

export const orderEndpoints = {
  async createOrder(data, customHeaders = {}) {
    const key =
      customHeaders['Idempotency-Key'] ||
      `idem-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    return await NETWORK.post('/orders', data, { 'Idempotency-Key': key, ...customHeaders });
  },

  async replayDlq(queue, limit = 10) {
    return await NETWORK.post(`/recovery/replay?queue=${encodeURIComponent(queue)}&limit=${limit}`);
  },

  async checkHealth() {
    return await NETWORK.get('/orders/health');
  },

  async getOrder(orderId) {
    return await NETWORK.get(`/orders/${orderId}`);
  },

  async getOrders(customerId) {
    return await NETWORK.get(`/orders/customer/${customerId}`);
  },

  async getOrderEvents(orderId) {
    return await NETWORK.get(`/orders/${orderId}/events`);
  },

  async getDriver(driverId) {
    return await NETWORK.get(`/drivers/driver/${driverId}`);
  },

  /**
   * Subscribes to live updates for one order and keeps the stream alive.
   *
   * EventSource reconnects by itself when the connection drops. If the browser gives up (readyState
   * CLOSED, e.g. the server answered with an error) we retry with exponential backoff instead of
   * leaving the order silently without live updates. After a reconnect a synthetic
   * `{ type: 'sse-reconnected' }` message tells the caller to resync, since events may have been missed.
   * Returns a handle with `close()`, or null when SSE is unsupported.
   */
  trackOrder(orderId, onMessage, onLocation) {
    const baseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080/api/v1';
    const sseHost = baseUrl.replace(/\/api\/v1\/?$/, '');
    const url = `${sseHost}/sse/order/${orderId}`;

    if (typeof EventSource === 'undefined') {
      console.error('Your browser does not support Server-Sent Events.');
      return null;
    }

    let source = null;
    let closed = false;
    let retryTimer = null;
    let attempt = 0;
    let hasOpened = false;

    const parse = (event) => {
      try {
        return JSON.parse(event.data);
      } catch {
        return event.data;
      }
    };

    const connect = () => {
      if (closed) return;
      source = new EventSource(url);

      source.onopen = () => {
        attempt = 0;
        if (hasOpened) {
          onMessage?.({ type: 'sse-reconnected' });
        }
        hasOpened = true;
      };

      source.onmessage = (event) => onMessage?.(parse(event));
      source.addEventListener('order-update', (event) => onMessage?.(parse(event)));
      source.addEventListener('location-update', (event) => {
        const loc = parse(event);
        if (!loc || typeof loc !== 'object') return; // ignore malformed pings
        if (onLocation) {
          onLocation(loc);
        } else {
          onMessage?.({ type: 'location-update', ...loc });
        }
      });

      source.onerror = () => {
        if (closed) return;
        if (source.readyState === EventSource.CLOSED) {
          const delay = Math.min(1000 * 2 ** attempt, 30000);
          attempt += 1;
          console.warn(`SSE for order ${orderId} closed; retrying in ${delay / 1000}s`);
          retryTimer = setTimeout(connect, delay);
        }
        // Otherwise the browser is already reconnecting on its own.
      };
    };

    connect();

    return {
      close() {
        closed = true;
        clearTimeout(retryTimer);
        source?.close();
      },
    };
  },
};
