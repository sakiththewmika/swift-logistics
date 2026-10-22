import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const Login = ({ onSwitchToSignUp }) => {
  const { login } = useAuth();
  const [form, setForm] = useState({ driverName: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.driverName || !form.password) {
      setError('Username and password are required.');
      return;
    }
    setLoading(true);
    try {
      await login(form.driverName, form.password);
      // On success, user is auto-logged in
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 400, margin: '40px auto', padding: 24 }}>
      <h2 className="section-title">Driver Login</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            name="driverName"
            placeholder="Username"
            value={form.driverName}
            onChange={handleChange}
            className="input"
            style={{ width: '100%', padding: 8 }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <input
            type="password"
            name="password"
            placeholder="Password"
            value={form.password}
            onChange={handleChange}
            className="input"
            style={{ width: '100%', padding: 8 }}
          />
        </div>
        {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}
        <button type="submit" className="primary-button" style={{ width: '100%' }} disabled={loading}>
          {loading ? 'Logging In...' : 'Log In'}
        </button>
      </form>
      <div style={{ marginTop: 16, textAlign: 'center' }}>
        Don't have an account?{' '}
        <button type="button" className="gray-button" onClick={onSwitchToSignUp}>
          Sign Up
        </button>
      </div>
    </div>
  );
};

export default Login;
