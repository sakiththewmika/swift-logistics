import React from 'react';
import { Bell } from 'lucide-react';

const NotificationBell = ({ unreadCount, onClick, expanded = false }) => (
  <button
    type="button"
    className="notification-bell"
    onClick={onClick}
    aria-label={unreadCount > 0 ? `Show notifications (${unreadCount} unread)` : 'Show notifications'}
    aria-haspopup="true"
    aria-expanded={expanded}
  >
    <Bell size={24} />
    {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
  </button>
);

export default NotificationBell;

