import apiClient from './network';

/**
 * Fetches the list of pending orders assigned to a specific driver.
 * This corresponds to the GET /api/v1/orders/driver/{driverId} endpoint.
 *
 * @param {string} driverId - The ID of the logged-in driver.
 * @returns {Promise<object>} A promise that resolves to the list of orders.
 */
export const getAssignedOrders = (driverId) => {
    if (!driverId) {
        return Promise.reject(new Error('Driver ID is required.'));
    }
    // Note the '/orders' in the path, matching the controller's base path
    return apiClient.get(`/drivers/driver/${driverId}`);
};

/**
 * Marks a specific order's delivery as started.
 * This corresponds to the PUT /api/v1/orders/driver/start/{orderId} endpoint.
 *
 * @param {string} orderId - The ID of the order to start.
 * @returns {Promise<object>} A promise that resolves on success.
 */
export const startDelivery = (orderId) => {
    if (!orderId) {
        return Promise.reject(new Error('Order ID is required.'));
    }
    return apiClient.put(`/drivers/driver/start/${orderId}`);
};

/**
 * Marks a specific order's delivery as complete.
 * This corresponds to the PUT /api/v1/orders/driver/complete/{orderId} endpoint.
 *
 * @param {string} orderId - The ID of the order to complete.
 * @returns {Promise<object>} A promise that resolves on success.
 */
export const completeDelivery = (orderId) => {
    if (!orderId) {
        return Promise.reject(new Error('Order ID is required.'));
    }
    return apiClient.put(`/drivers/driver/complete/${orderId}`);
};