import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const SignUp = ({ onSwitchToLogin }) => {
  const { signup } = useAuth();
  const [form, setForm] = useState({ driverName: '', password: '', confirmPassword: '', vehicleId: '', type: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.driverName || !form.password || !form.confirmPassword || !form.vehicleId || !form.type) {
      setError('All fields are required.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await signup(form);
      // On success, user is auto-logged in
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Signup failed.');
    } finally {
      setLoading(false);

    }
  };

  return (
    <div className="card" style={{ maxWidth: 400, margin: '40px auto', padding: 24 }}>
      <h2 className="section-title">Driver Sign Up</h2>
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
            type="text"
            name="vehicleId"
            placeholder="Vehicle  Number"
            value={form.vehicleId}
            onChange={handleChange}
            className="input"
            style={{ width: '100%', padding: 8 }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            name="type"
            placeholder="Vehicle Type"
            value={form.type}
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
        <div style={{ marginBottom: 12 }}>
          <input
            type="password"
            name="confirmPassword"
            placeholder="Confirm Password"
            value={form.confirmPassword}
            onChange={handleChange}
            className="input"
            style={{ width: '100%', padding: 8 }}
          />
        </div>
        {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}
        <button type="submit" className="primary-button" style={{ width: '100%' }} disabled={loading}>
          {loading ? 'Signing Up...' : 'Sign Up'}
        </button>
      </form>
      <div style={{ marginTop: 16, textAlign: 'center' }}>
        Already have an account?{' '}
        <button type="button" className="gray-button" onClick={onSwitchToLogin}>
          Log In
        </button>
      </div>
    </div>
  );
};

export default SignUp;

