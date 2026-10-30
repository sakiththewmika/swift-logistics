import NETWORK from './network';

export const orderEndpoints = {
  async createOrder(data) {
    return await NETWORK.post('/orders', data);
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

  trackOrder(orderId, onMessage) {
    const baseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000/api/v1';
    const sseHost = baseUrl.replace(/\/api\/v1\/?$/, '');
    const url = `${sseHost}/sse/order/${orderId}`;

    if (typeof EventSource !== 'undefined') {
      const source = new EventSource(url);

      source.onmessage = function (event) {
        try {
          const update = JSON.parse(event.data);
          onMessage?.(update);
        } catch {
          onMessage?.(event.data);
        }
      };

      source.addEventListener('order-update', function (event) {
        try {
          const update = JSON.parse(event.data);
          onMessage?.(update);
        } catch {
          onMessage?.(event.data);
        }
      });

      source.onerror = function (err) {
        console.warn('SSE connection closed/error for order:', orderId, err);
        source.close();
      };

      return source;
    } else {
      console.error('Your browser does not support Server-Sent Events.');
      return null;
    }
  },
};
