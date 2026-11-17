import React from 'react';

const NotificationList = ({ notifications, onClose, onMarkAllRead, onSelectNotification }) => (
  <div className="notification-dropdown">
    <div className="notification-header">
      <span className="notification-title">Notifications</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" onClick={onMarkAllRead} style={{ border: 0, background: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 11 }}>
          Mark all read
        </button>
        <button type="button" className="notification-close" onClick={onClose}>×</button>
      </div>
    </div>
    <ul className="notification-list">
      {notifications.length === 0 && <li className="notification-item empty">No notifications</li>}
      {notifications.map(n => (
        <li
          key={n.id}
          className={`notification-item${n.read ? ' read' : ''}`}
          onClick={() => onSelectNotification?.(n)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') onSelectNotification?.(n);
          }}
        >
          <span>{n.message}</span>
          <span className="notification-time">{n.time}</span>
        </li>
      ))}
    </ul>
  </div>
);

export default NotificationList;

