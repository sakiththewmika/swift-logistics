import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import './AppStyles.css';
import OrderList from './components/OrderList';
import OrderDetails from './components/OrderDetails';
import NotificationBell from './components/NotificationBell';
import NotificationList from './components/NotificationList';
import UserProfile from './components/UserProfile';
import CreateOrderModal from './components/CreateOrderModal';
import SignInModal from './components/SignInModal';
import SignUpModal from './components/SignUpModal';
import SystemOpsModal from './components/SystemOpsModal';
import Toast from './components/Toast';
import { useAuth } from './context/AuthContext';
import { orderEndpoints } from './network/order';
import {
  Package,
  Clock,
  Truck,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Activity,
  RotateCcw,
} from 'lucide-react';

const getStatusColor = (status) => {
  switch (status) {
    case 'PENDING':
    case 'NEW':
    case 'CREATED':
      return { backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' };
    case 'BILLED':
      return { backgroundColor: '#e0e7ff', color: '#3730a3', border: '1px solid #a5b4fc' };
    case 'IN_WAREHOUSE':
    case 'READY':
    case 'PACKED':
    case 'PROCESSING':
      return { backgroundColor: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd' };
    case 'ROUTED':
    case 'DISPATCHED':
      return { backgroundColor: '#fae8ff', color: '#86198f', border: '1px solid #f0abfc' };
    case 'IN_TRANSIT':
    case 'OUT_FOR_DELIVERY':
      return { backgroundColor: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd' };
    case 'DELIVERED':
    case 'COMPLETED':
      return { backgroundColor: '#dcfce7', color: '#166534', border: '1px solid #86efac' };
    case 'FAILED':
    case 'CANCELLED_REFUNDED':
    case 'BILLING_FAILED':
    case 'WAREHOUSE_FAILED':
    case 'ROUTE_FAILED':
      return { backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' };
    default:
      return { backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' };
  }
};

const getStatusIcon = (status) => {
  switch (status) {
    case 'PENDING':
    case 'NEW':
    case 'CREATED':
      return <Clock size={16} />;
    case 'BILLED':
    case 'IN_WAREHOUSE':
    case 'READY':
    case 'PACKED':
      return <Package size={16} />;
    case 'ROUTED':
    case 'DISPATCHED':
    case 'IN_TRANSIT':
    case 'OUT_FOR_DELIVERY':
      return <Truck size={16} />;
    case 'DELIVERED':
    case 'COMPLETED':
      return <CheckCircle size={16} />;
    case 'FAILED':
    case 'CANCELLED_REFUNDED':
    case 'BILLING_FAILED':
      return <AlertCircle size={16} />;
    default:
      return <Package size={16} />;
  }
};

const formatStatus = (status) => {
  if (!status) return 'New';
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase());
};

const ClientPortal = () => {
  const { customer, isAuthenticated, getCustomerId } = useAuth();
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [notifications] = useState([
    { id: 1, message: 'Order ORD-COL-1001 is out for delivery in Colombo', time: '10m ago', read: false },
    { id: 2, message: 'Order ORD-COL-1002 has completed proof of delivery', time: '1h ago', read: true },
  ]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);
  const [showSystemOps, setShowSystemOps] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Toast Notification System
  const [toasts, setToasts] = useState([]);
  const prevOrderStatusesRef = useRef({});

  const addToast = useCallback((toast) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 7);
    setToasts((prev) => [...prev, { id, ...toast }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const id = getCustomerId();
      if (!id) return;
      setIsRefreshing(true);
      const res = await orderEndpoints.getOrders(id);
      const list = Array.isArray(res) ? res : res?.orders || [];

      // Detect status changes between polls and trigger real-time toasts
      list.forEach((order) => {
        const prevStatus = prevOrderStatusesRef.current[order.orderId];
        if (prevStatus && prevStatus !== order.status) {
          const isFail =
            order.status.includes('FAIL') ||
            order.status.includes('CANCEL') ||
            order.status.includes('ROLLBACK');
          const isDelivered = order.status === 'DELIVERED';

          addToast({
            title: `Order ${order.orderId}`,
            message: `Status transitioned: ${prevStatus} → ${order.status}`,
            type: isFail ? 'error' : isDelivered ? 'success' : 'info',
          });
        }
        prevOrderStatusesRef.current[order.orderId] = order.status;
      });

      setOrders(list);

      // Keep selected order in sync or default to first
      setSelectedOrder((prevSelected) => {
        if (!prevSelected && list.length > 0) {
          return list[0];
        }
        if (prevSelected) {
          const fresh = list.find((o) => o.orderId === prevSelected.orderId);
          return fresh || prevSelected;
        }
        return null;
      });
    } catch (e) {
      console.error('Failed to fetch orders', e);
    } finally {
      setIsRefreshing(false);
    }
  }, [getCustomerId, addToast]);

  // Initial load
  useEffect(() => {
    if (isAuthenticated) {
      fetchOrders();
    }
  }, [isAuthenticated, fetchOrders]);

  // Zero-Refresh Live Auto-Sync: Poll every 4 seconds while any order is in non-terminal state
  useEffect(() => {
    if (!isAuthenticated) return;

    const hasActiveOrders = orders.some((o) => {
      const s = o.status?.toUpperCase() || '';
      return !['DELIVERED', 'COMPLETED', 'FAILED', 'CANCELLED_REFUNDED'].includes(s);
    });

    if (!hasActiveOrders && orders.length > 0) return;

    const timer = setInterval(() => {
      fetchOrders();
    }, 4000);

    return () => clearInterval(timer);
  }, [isAuthenticated, orders, fetchOrders]);

  const handleCreateOrder = async (orderData) => {
    if (!isAuthenticated) {
      setShowCreateOrder(false);
      setShowSignIn(true);
      return;
    }

    try {
      const newOrder = {
        ...orderData,
        customerId: getCustomerId() || undefined,
        status: 'PENDING',
        estimatedDelivery: orderData.estimatedDelivery || '',
      };
      const createdOrder = await orderEndpoints.createOrder(newOrder);
      setOrders((prev) => [createdOrder, ...prev]);
      setSelectedOrder(createdOrder);
      setShowCreateOrder(false);
      addToast({
        title: 'Order Created',
        message: `Order ${createdOrder.orderId} submitted to Saga orchestration.`,
        type: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Order Submission Failed',
        message: err.message || 'Could not create order',
        type: 'error',
      });
    }
  };

  // KPI Metric Calculations
  const kpiMetrics = useMemo(() => {
    const totalOrdersCount = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);

    const activeOrders = orders.filter((o) => {
      const s = o.status?.toUpperCase() || '';
      return [
        'NEW',
        'PENDING',
        'CREATED',
        'BILLED',
        'READY',
        'PACKED',
        'PROCESSING',
        'ROUTED',
        'DISPATCHED',
        'IN_TRANSIT',
        'ASSIGNED',
      ].includes(s);
    });

    const completedOrders = orders.filter((o) => {
      const s = o.status?.toUpperCase() || '';
      return ['DELIVERED', 'COMPLETED'].includes(s);
    });

    const exceptionOrders = orders.filter((o) => {
      const s = o.status?.toUpperCase() || '';
      return (
        s.includes('FAIL') ||
        s.includes('COMPENSAT') ||
        s.includes('CANCEL') ||
        s.includes('ROLLBACK') ||
        s.includes('REFUND')
      );
    });

    const successRate =
      totalOrdersCount > 0
        ? Math.round(
            (completedOrders.length / (completedOrders.length + exceptionOrders.length || 1)) * 100
          )
        : 100;

    return {
      totalOrdersCount,
      totalRevenue,
      activeOrdersCount: activeOrders.length,
      completedOrdersCount: completedOrders.length,
      exceptionOrdersCount: exceptionOrders.length,
      successRate,
    };
  }, [orders]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="container" style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Top Header */}
      <header className="header" style={{ borderBottom: '1px solid #1e293b' }}>
        <div className="header-content" style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                backgroundColor: '#3b82f6',
                padding: 6,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Package size={24} color="#ffffff" />
            </div>
            <div>
              <span className="logo-text" style={{ fontSize: 18, fontWeight: 700 }}>
                SwiftLogistics Portal
              </span>
              <span
                style={{
                  display: 'block',
                  fontSize: 11,
                  color: '#93c5fd',
                  fontWeight: 500,
                  marginTop: -2,
                }}
              >
                Enterprise Middleware Command Center
              </span>
            </div>
          </div>

          <div className="header-actions">
            <NotificationBell
              unreadCount={unreadCount}
              onClick={() => setShowNotifications(!showNotifications)}
            />
            {showNotifications && (
              <NotificationList
                notifications={notifications}
                onClose={() => setShowNotifications(false)}
              />
            )}
            {isAuthenticated ? (
              <>
                <UserProfile
                  user={{
                    name: customer?.customerName || customer?.customerEmail || 'Demo Client',
                  }}
                />
                <button
                  className="create-order-btn"
                  onClick={fetchOrders}
                  title="Sync latest order status from backend"
                  style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <RefreshCw size={14} className={isRefreshing ? 'spin' : ''} /> Refresh
                </button>
              </>
            ) : (
              <>
                <button className="create-order-btn" onClick={() => setShowSignIn(true)}>
                  Sign In
                </button>
                <button className="create-order-btn" onClick={() => setShowSignUp(true)}>
                  Sign Up
                </button>
              </>
            )}

            <button
              className="create-order-btn"
              onClick={() => setShowCreateOrder(true)}
              style={{ backgroundColor: '#2563eb', fontWeight: 600 }}
            >
              + Create Order
            </button>

            <button
              className="create-order-btn"
              onClick={() => setShowSystemOps(true)}
              title="Open Middleware Architecture & Chaos Recovery Console"
              style={{
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                border: '1px solid #334155',
              }}
            >
              <Activity size={15} color="#38bdf8" /> Middleware Ops & Chaos
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 20px 32px 20px' }}>
        {/* KPI Metric Summary Ribbon */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
            marginBottom: 20,
          }}
        >
          {/* Card 1: Total Volume */}
          <div className="kpi-card">
            <div className="kpi-icon-wrap" style={{ backgroundColor: '#eff6ff', color: '#2563eb' }}>
              <Package size={22} />
            </div>
            <div>
              <div className="kpi-label">TOTAL VOLUME</div>
              <div className="kpi-value">{kpiMetrics.totalOrdersCount} Orders</div>
              <div className="kpi-subtext">
                LKR {kpiMetrics.totalRevenue.toLocaleString()} Total Value
              </div>
            </div>
          </div>

          {/* Card 2: In Pipeline & Transit */}
          <div className="kpi-card">
            <div className="kpi-icon-wrap" style={{ backgroundColor: '#fef3c7', color: '#d97706' }}>
              <Truck size={22} />
            </div>
            <div>
              <div className="kpi-label">IN PIPELINE & TRANSIT</div>
              <div className="kpi-value">{kpiMetrics.activeOrdersCount} Active</div>
              <div className="kpi-subtext">Real-Time Middleware Dispatch</div>
            </div>
          </div>

          {/* Card 3: Completed Deliveries */}
          <div className="kpi-card">
            <div className="kpi-icon-wrap" style={{ backgroundColor: '#f0fdf4', color: '#16a34a' }}>
              <CheckCircle size={22} />
            </div>
            <div>
              <div className="kpi-label">VERIFIED DELIVERIES</div>
              <div className="kpi-value">{kpiMetrics.completedOrdersCount} Completed</div>
              <div className="kpi-subtext">{kpiMetrics.successRate}% Handover Success</div>
            </div>
          </div>

          {/* Card 4: Saga Exceptions & Rollbacks */}
          <div className="kpi-card">
            <div
              className="kpi-icon-wrap"
              style={{
                backgroundColor:
                  kpiMetrics.exceptionOrdersCount > 0 ? '#fef2f2' : '#f8fafc',
                color: kpiMetrics.exceptionOrdersCount > 0 ? '#dc2626' : '#64748b',
              }}
            >
              <RotateCcw size={22} />
            </div>
            <div>
              <div className="kpi-label">SAGA EXCEPTIONS / ROLLBACKS</div>
              <div className="kpi-value">{kpiMetrics.exceptionOrdersCount} Incidents</div>
              <div className="kpi-subtext">
                {kpiMetrics.exceptionOrdersCount === 0
                  ? 'Zero Compensation Rollbacks'
                  : 'Compensated via Outbox'}
              </div>
            </div>
          </div>
        </div>

        {/* Master-Detail Split-Screen Workspace */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 380px) 1fr', gap: 20 }}>
          {/* Left Column: Master List */}
          <div>
            <OrderList
              orders={orders}
              onSelect={setSelectedOrder}
              selectedOrder={selectedOrder}
              getStatusColor={getStatusColor}
              getStatusIcon={getStatusIcon}
              formatStatus={formatStatus}
            />
          </div>

          {/* Right Column: Detail & Tracking Command Center */}
          <div>
            <OrderDetails
              order={selectedOrder}
              getStatusColor={getStatusColor}
              getStatusIcon={getStatusIcon}
              formatStatus={formatStatus}
            />
          </div>
        </div>
      </div>

      {/* Floating Toast Notification Banner */}
      <Toast toasts={toasts} onDismiss={removeToast} />

      {/* Modals */}
      {showCreateOrder && (
        <CreateOrderModal
          onClose={() => setShowCreateOrder(false)}
          onCreate={handleCreateOrder}
          presaved={{
            pickupAddress: 'Peliyagoda Central Hub, Colombo',
            driverName: null,
            items: ['Express Parcel Package'],
            status: 'PENDING',
            estimatedDelivery: '',
            createdAt: new Date().toISOString().slice(0, 16),
          }}
        />
      )}
      {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}
      {showSignUp && <SignUpModal onClose={() => setShowSignUp(false)} />}
      {showSystemOps && (
        <SystemOpsModal
          onClose={() => setShowSystemOps(false)}
          onOrderCreated={(newOrder) => {
            fetchOrders();
            if (newOrder) setSelectedOrder(newOrder);
          }}
          customerId={getCustomerId()}
        />
      )}
    </div>
  );
};

export default ClientPortal;
