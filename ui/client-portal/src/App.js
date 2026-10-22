import React, { useState, useEffect, useCallback } from 'react';
import './AppStyles.css';
import OrderList from './components/OrderList';
import OrderDetails from './components/OrderDetails';
import NotificationBell from './components/NotificationBell';
import NotificationList from './components/NotificationList';
import UserProfile from './components/UserProfile';
import CreateOrderModal from './components/CreateOrderModal';
import SignInModal from './components/SignInModal';
import SignUpModal from './components/SignUpModal';
import { useAuth } from './context/AuthContext';
import { orderEndpoints } from './network/order';
import { Package, Clock, Truck, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

const getStatusColor = (status) => {
  switch (status) {
    case 'PENDING': return { backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' };
    case 'IN_WAREHOUSE': return { backgroundColor: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd' };
    case 'IN_TRANSIT': return { backgroundColor: '#e0e7ff', color: '#3730a3', border: '1px solid #a5b4fc' };
    case 'DELIVERED': return { backgroundColor: '#dcfce7', color: '#166534', border: '1px solid #86efac' };
    case 'FAILED': return { backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' };
    default: return { backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' };
  }
};

const getStatusIcon = (status) => {
  switch (status) {
    case 'PENDING': return <Clock size={16} />;
    case 'IN_WAREHOUSE': return <Package size={16} />;
    case 'IN_TRANSIT': return <Truck size={16} />;
    case 'DELIVERED': return <CheckCircle size={16} />;
    case 'FAILED': return <AlertCircle size={16} />;
    default: return <Package size={16} />;
  }
};

const formatStatus = (status) => {
  return status.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
};



const ClientPortal = () => {
  const { customer, isAuthenticated, getCustomerId } = useAuth();
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [notifications] = useState([
    { id: 1, message: 'Order ORD-12345 is now in transit', time: '10 minutes ago', read: false },
    { id: 2, message: 'Order ORD-12347 has been delivered', time: '1 day ago', read: true }
  ])
  const [showNotifications, setShowNotifications] = useState(false);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      const id = getCustomerId();
      if (!id) return;
      const res = await orderEndpoints.getOrders(id);
      const list = Array.isArray(res) ? res : (res?.orders || []);
      setOrders(list);
    } catch (e) {
      console.error('Failed to fetch orders', e);
    }
  }, [getCustomerId]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchOrders();
    }
  }, [isAuthenticated, fetchOrders]);

  const handleCreateOrder = async (orderData) => {
    if (!isAuthenticated) {
      setShowCreateOrder(false);
      setShowSignIn(true);
      return;
    }
    const newOrder = {
      ...orderData,
      customerId: getCustomerId() || undefined,
      status: 'PENDING',
      estimatedDelivery: orderData.estimatedDelivery || '',
    };
    const createdOrder = await orderEndpoints.createOrder(newOrder);
    setOrders([createdOrder, ...orders]);
    setShowCreateOrder(false);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="container">
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <Package size={32} />
            <span className="logo-text">Client Portal</span>
          </div>
          <div className="header-actions">
            <NotificationBell unreadCount={unreadCount} onClick={() => setShowNotifications(!showNotifications)} />
            {showNotifications && (
              <NotificationList notifications={notifications} onClose={() => setShowNotifications(false)} />
            )}
            {isAuthenticated ? (
              <>
                <UserProfile user={{ name: customer?.customerName || customer?.customerEmail || 'Customer' }} />
                <button className="create-order-btn" onClick={fetchOrders} title="Refresh orders">
                  <RefreshCw size={16} style={{ marginRight: 8 }} /> Refresh
                </button>
              </>
            ) : (
              <>
                <button className="create-order-btn" onClick={() => setShowSignIn(true)}>Sign In</button>
                <button className="create-order-btn" onClick={() => setShowSignUp(true)}>Sign Up</button>
              </>
            )}
            <button className="create-order-btn" onClick={() => setShowCreateOrder(true)}>
              + Create Order
            </button>
          </div>
        </div>
      </header>
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: 16, display: 'flex', gap: 32 }}>
        <div style={{ flex: 1 }}>
          <OrderList
            orders={orders}
            onSelect={setSelectedOrder}
            selectedOrder={selectedOrder}
            getStatusColor={getStatusColor}
            getStatusIcon={getStatusIcon}
            formatStatus={formatStatus}
          />
        </div>
        <div style={{ flex: 2 }}>
          <OrderDetails
            order={selectedOrder}
            getStatusColor={getStatusColor}
            getStatusIcon={getStatusIcon}
            formatStatus={formatStatus}
          />
        </div>
      </main>
      {showCreateOrder && (
        <CreateOrderModal
          onClose={() => setShowCreateOrder(false)}
          onCreate={handleCreateOrder}
          presaved={{
            pickupAddress: 'Warehouse A, Colombo 01',
            driverName: null,
            items: ['General Package'],
            status: 'PENDING',
            estimatedDelivery: '',
            createdAt: new Date().toISOString().slice(0, 16)
          }}
        />
      )}
      {showSignIn && (
        <SignInModal onClose={() => setShowSignIn(false)} />
      )}
      {showSignUp && (
        <SignUpModal onClose={() => setShowSignUp(false)} />
      )}
    </div>
  );
};

export default ClientPortal;
