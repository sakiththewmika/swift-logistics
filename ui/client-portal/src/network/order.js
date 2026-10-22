import NETWORK from './network'

export const orderEndpoints = {
  async createOrder(data) {
    return await NETWORK.post('/orders', data)
  },
  async getOrders(customerId) {
    return await NETWORK.get(`/orders/customer/${customerId}`)
  },
  async getDriver(driverId) {
    return await NETWORK.get(`/drivers/driver/${driverId}`)
  },

  async trackOrder(orderId) {
    const url = `http://localhost:8000/sse/order/${orderId}`;
    if (typeof (EventSource) !== "undefined") {
      const source = new EventSource(url);
      source.onmessage = function (event) {
        const update = JSON.parse(event.data);
        console.log('Order update received:', update);
        // Here you can dispatch an action or update state with the new order status
      };

      source.addEventListener('order-update', function (event) {
        const update = JSON.parse(event.data);
        console.log('Order update event:', update);
        // Handle specific order update event
      });

      source.onerror = function (err) {
        console.error("EventSource failed:", err);
        source.close();
      };
      return source; // Return the EventSource instance to allow closing it later
    } else {
      console.error("Your browser does not support Server-Sent Events.");
      return null;
    }
  }
}