import React from 'react';
import { User, LogOut } from 'lucide-react';

const UserProfile = ({ user, onLogout }) => (
  <div className="user-info">
    <User size={20} />
    <span>{user.name}</span>
    <button type="button" onClick={onLogout} title="Logout" aria-label="Logout">
      <LogOut size={20} />
    </button>
  </div>
);

export default UserProfile;

