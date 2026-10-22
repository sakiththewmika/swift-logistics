import React, { createContext, useContext, useState, useEffect } from 'react';
import { login as loginApi, signup as signupApi, logout as logoutApi } from '../network/auth'; // Import the login, signup, and logout functions

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [driver, setDriver] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('driver_token'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // This effect runs on startup to check if a user is already logged in
        // from a previous session.
        const storedDriver = localStorage.getItem('driver_details');
        if (token && storedDriver) {
            try {
                const parsedDriver = JSON.parse(storedDriver);
                if (parsedDriver?.driverId === token) {
                    setDriver(parsedDriver);
                } else {
                    localStorage.removeItem('driver_token');
                    localStorage.removeItem('driver_details');
                    setToken(null);
                }
            } catch {
                localStorage.removeItem('driver_token');
                localStorage.removeItem('driver_details');
                setToken(null);
            }
        }
        setLoading(false);
    }, [token]);

    const login = async (driverName, password) => {
        try {
            const user = await loginApi(driverName, password);
            console.log("user:", user);
            const token = user.driverId;

            // Store the token and user details
            localStorage.setItem('driver_token', token);
            localStorage.setItem('driver_details', JSON.stringify(user));

            setToken(token);
            setDriver(user);
        } catch (error) {
            console.error("Login failed:", error);
            // Handle login errors (e.g., show a message to the user)
            throw error;
        }
    };

    const signup = async (driver) => {
        try {
            const user = await signupApi(driver);
            localStorage.setItem('driver_token', user.driverId);
            localStorage.setItem('driver_details', JSON.stringify(user));
            setToken(user.driverId);
            setDriver(user);
        } catch (error) {
            console.error("Signup failed:", error);
            throw error;
        }
    };

    const logout = async () => {
        try {
            await logoutApi();
        } catch (e) {
            console.log("Logout failed:", e);
        }
        localStorage.removeItem('driver_token');
        localStorage.removeItem('driver_details');
        setToken(null);
        setDriver(null);
    };

    const value = {
        driver,
        token,
        login,
        logout,
        signup,
        isAuthenticated: !!token,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    return useContext(AuthContext);
};