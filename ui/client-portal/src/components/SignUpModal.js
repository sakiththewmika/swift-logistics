import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const SignUpModal = ({ onClose }) => {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signup(name, email, password);
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to sign up');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2 style={{marginTop:0,marginBottom:18,fontWeight:600,fontSize:22,color:'#1e293b'}}>Sign Up</h2>
        <form onSubmit={handleSubmit} className="create-order-form">
          <label>
            Name
            <input name="name" value={name} onChange={(e)=>setName(e.target.value)} required />
          </label>
          <label>
            Email
            <input type="email" name="email" value={email} onChange={(e)=>setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" name="password" value={password} onChange={(e)=>setPassword(e.target.value)} required minLength={6} />
          </label>
          {error && <div style={{ color:'#b91c1c', fontSize:13 }}>{error}</div>}
          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" disabled={loading}>{loading ? 'Signing up...' : 'Sign Up'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SignUpModal;

