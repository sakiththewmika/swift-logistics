import apiClient from './network';

/**
 * Authenticates a driver using their username and password.
 *
 * @param {string} driverName - The driver's username.
 * @param {string} password - The driver's password.
 * @returns {Promise<object>} A promise that resolves to the login response,
 * which includes the auth token and driver details.
 */
export const login = (driverName, password) => {
    if (!driverName || !password) {
        return Promise.reject(new Error('Username and password are required.'));
    }
    return apiClient.post('/auth/driver', { username: driverName, password });
};

/**
 * Registers a new driver.
 *
 * @param {object} driver - The driver details (name, email, password).
 * @returns {Promise<object>} A promise that resolves to the signup response.
 */
export const signup = (driver) => {
    // if (!name || !email || !password) {
    //     return Promise.reject(new Error('Name, email, and password are required.'));
    // }
    return apiClient.post('/auth/driver-sign-up', driver);
};

/**
 * Logs out the currently authenticated driver.
 *
 * @returns {Promise<object>} A promise that resolves to the logout response.
 */
export const logout = () => {
    return apiClient.post('/auth/driver-logout');
};
