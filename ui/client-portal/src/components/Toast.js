import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

const Toast = ({ toasts, onDismiss }) => {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 420,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastItem = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, toast.duration || 4500);

    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const getTheme = () => {
    switch (toast.type) {
      case 'success':
        return {
          bg: '#f0fdf4',
          border: '#bbf7d0',
          color: '#166534',
          icon: <CheckCircle size={18} color="#16a34a" />,
        };
      case 'error':
        return {
          bg: '#fef2f2',
          border: '#fecaca',
          color: '#991b1b',
          icon: <AlertCircle size={18} color="#dc2626" />,
        };
      case 'warning':
        return {
          bg: '#fffbeb',
          border: '#fde68a',
          color: '#92400e',
          icon: <AlertCircle size={18} color="#d97706" />,
        };
      default:
        return {
          bg: '#f0f9ff',
          border: '#bae6fd',
          color: '#075985',
          icon: <Info size={18} color="#0284c7" />,
        };
    }
  };

  const theme = getTheme();

  return (
    <div
      style={{
        pointerEvents: 'auto',
        backgroundColor: theme.bg,
        border: `1px solid ${theme.border}`,
        color: theme.color,
        borderRadius: 8,
        padding: '12px 16px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1.4,
        animation: 'slideInRight 0.25s ease-out',
      }}
    >
      <div style={{ flexShrink: 0, marginTop: 1 }}>{theme.icon}</div>
      <div style={{ flex: 1 }}>
        {toast.title && <div style={{ fontWeight: 600, marginBottom: 2 }}>{toast.title}</div>}
        <div>{toast.message}</div>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        style={{
          background: 'none',
          border: 'none',
          color: theme.color,
          cursor: 'pointer',
          padding: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.7,
        }}
      >
        <X size={15} />
      </button>
    </div>
  );
};

export default Toast;

