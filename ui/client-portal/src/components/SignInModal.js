import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const SignInModal = ({ onClose }) => {
  const { signin } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signin(username, password);
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2 style={{marginTop:0,marginBottom:18,fontWeight:600,fontSize:22,color:'#1e293b'}}>Sign In</h2>
        <form onSubmit={handleSubmit} className="create-order-form">
          <label>
            Username or email
            <input name="username" value={username} onChange={(e)=>setUsername(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" name="password" value={password} onChange={(e)=>setPassword(e.target.value)} required />
          </label>
          {error && <div style={{ color:'#b91c1c', fontSize:13 }}>{error}</div>}
          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SignInModal;
