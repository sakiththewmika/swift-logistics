import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { authEndpoints } from '../network/auth';

const AuthContext = createContext(null);

const STORAGE_KEY = 'swiftlogistics_customer';

export const AuthProvider = ({ children }) => {
  const [customer, setCustomer] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.error('Failed to load customer from localStorage', e);
      return null;
    }
  });

  const signin = useCallback(async (customerName, password) => {
    const payload = { username: customerName, password };
    const res = await authEndpoints.signin(payload);
    // Support either { customer: {...} } or the customer object directly
    const cust = res?.customer ?? res ?? null;
    setCustomer(cust);
    if (cust) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cust));
      } catch (e) {
        console.error('Failed to save customer to localStorage', e);
      }
    }
    return cust;
  }, []);

  const signout = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error('Failed to remove customer from localStorage', e);
    }
    setCustomer(null);
  }, []);

  const getCustomerId = useCallback(() => customer?.customerId ?? customer?.id ?? null, [customer]);

  const value = useMemo(() => ({
    customer,
    isAuthenticated: !!customer,
    signin,
    signout,
    getCustomerId,
  }), [customer, signin, signout, getCustomerId]);

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

export default AuthContext;
