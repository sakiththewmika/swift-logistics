import React, { useState, useEffect } from 'react';
import StatusBadge from './StatusBadge';
import OrderStepper from './OrderStepper';
import AuditTimeline from './AuditTimeline';
import LiveDeliveryMap from './LiveDeliveryMap';
import {
  MapPin,
  User,
  Clock,
  Package,
  CheckCircle,
  FileText,
  AlertCircle,
  Camera,
  PenTool,
  RefreshCw,
} from 'lucide-react';
import { orderEndpoints } from '../network/order';

const OrderDetails = ({ order, getStatusColor, getStatusIcon, formatStatus }) => {
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(order?.status || 'NEW');
  const [driverLocation, setDriverLocation] = useState(null);

  // Sync internal status with prop
  useEffect(() => {
    if (order?.status) {
      setCurrentStatus(order.status);
    }
  }, [order?.status]);

  // Load audit events and connect to SSE stream
  useEffect(() => {
    if (!order?.orderId) {
      setEvents([]);
      setDriverLocation(null);
      return;
    }

    let isMounted = true;
    setEventsLoading(true);

    const loadEvents = () => {
      orderEndpoints
        .getOrderEvents(order.orderId)
        .then((data) => {
          if (isMounted) {
            setEvents(Array.isArray(data) ? data : []);
          }
        })
        .catch((err) => {
          console.warn('Failed to fetch events for order:', order.orderId, err);
          if (isMounted) setEvents([]);
        })
        .finally(() => {
          if (isMounted) setEventsLoading(false);
        });
    };

    loadEvents();

    // Subscribe to SSE updates (order updates + real-time telematics location)
    const sseSource = orderEndpoints.trackOrder(
      order.orderId,
      (update) => {
        if (!isMounted) return;
        if (update && typeof update === 'object') {
          if (update.type === 'location-update' || (update.latitude && update.longitude)) {
            setDriverLocation({
              latitude: Number(update.latitude),
              longitude: Number(update.longitude),
              speed: Number(update.speed || 0),
              heading: Number(update.heading || 0),
              timestamp: update.timestamp,
            });
            return;
          }
          if (update.status) {
            setCurrentStatus(update.status);
          }
        }
        loadEvents();
      },
      (locUpdate) => {
        if (!isMounted) return;
        if (locUpdate && locUpdate.latitude && locUpdate.longitude) {
          setDriverLocation({
            latitude: Number(locUpdate.latitude),
            longitude: Number(locUpdate.longitude),
            speed: Number(locUpdate.speed || 0),
            heading: Number(locUpdate.heading || 0),
            timestamp: locUpdate.timestamp,
          });
        }
      }
    );

    return () => {
      isMounted = false;
      if (sseSource) {
        sseSource.close();
      }
    };
  }, [order?.orderId]);

  if (!order) {
    return (
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 10,
          border: '1px solid #e2e8f0',
          padding: 48,
          textAlign: 'center',
          color: '#94a3b8',
          height: 'calc(100vh - 220px)',
          minHeight: 680,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        }}
      >
        <Package size={56} style={{ color: '#cbd5e1', marginBottom: 12 }} />
        <h3 style={{ margin: 0, color: '#475569', fontSize: 18, fontWeight: 600 }}>
          No Order Selected
        </h3>
        <p style={{ margin: '8px 0 0 0', fontSize: 13, color: '#94a3b8', maxWidth: 360 }}>
          Select an order from the list on the left to track real-time telematics, Saga lifecycle stages, and proof of delivery.
        </p>
      </div>
    );
  }

  const handleRefreshEvents = () => {
    if (!order?.orderId) return;
    setEventsLoading(true);
    orderEndpoints
      .getOrderEvents(order.orderId)
      .then((data) => setEvents(Array.isArray(data) ? data : []))
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));
  };

  const isDelivered = currentStatus === 'DELIVERED';
  const hasPodData = Boolean(
    order.proofOfDeliverySignature ||
    order.proofOfDeliveryPhoto ||
    order.deliveryNotes ||
    isDelivered
  );
  const isFailed = currentStatus === 'FAILED';

  return (
    <div
      className="order-details"
      key={order.orderId}
      style={{
        margin: 0,
        borderRadius: 10,
        border: '1px solid #e2e8f0',
        height: 'calc(100vh - 220px)',
        minHeight: 680,
        overflowY: 'auto',
        padding: 20,
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, color: '#1e293b' }}>Order Details</h2>
          <span style={{ fontSize: 13, color: '#64748b' }}>
            ID: <strong style={{ fontFamily: 'monospace', color: '#0f172a' }}>{order.orderId}</strong>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="create-order-btn"
            onClick={handleRefreshEvents}
            title="Refresh order events"
            style={{ margin: 0, padding: '7px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <RefreshCw size={14} className={eventsLoading ? 'spin' : ''} />
            Refresh Trail
          </button>
        </div>
      </div>

      {/* Visual Order Lifecycle Stepper with Saga rollback alerts */}
      <OrderStepper
        status={currentStatus}
        failureReason={order.deliveryFailureReason}
        deliveryNotes={order.deliveryNotes}
      />

      {/* Summary Metadata Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          padding: 14,
          backgroundColor: '#f8fafc',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
          marginBottom: 16,
        }}
      >
        <div>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block' }}>CURRENT STATUS</span>
          <div style={{ marginTop: 4 }}>
            <StatusBadge
              status={currentStatus}
              getStatusColor={getStatusColor}
              getStatusIcon={getStatusIcon}
              formatStatus={formatStatus}
            />
          </div>
        </div>

        <div>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block' }}>DELIVERY DESTINATION</span>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <MapPin size={14} color="#64748b" />
            <span>{order.deliveryAddress || 'Colombo, Sri Lanka'}</span>
          </div>
        </div>

        <div>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block' }}>ASSIGNED DRIVER</span>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <User size={14} color="#64748b" />
            <span>{order.driverName || order.driverId || 'Pending Assignment'}</span>
            {order.vehicleId && (
              <span style={{ fontSize: 11, color: '#64748b' }}>({order.vehicleId})</span>
            )}
          </div>
        </div>

        <div>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block' }}>TOTAL AMOUNT</span>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginTop: 4 }}>
            {order.totalAmount ? `LKR ${Number(order.totalAmount).toLocaleString()}` : 'N/A'}
            <span style={{ fontSize: 11, color: '#16a34a', marginLeft: 6, fontWeight: 500 }}>
              ({order.billingStatus || 'PAID'})
            </span>
          </div>
        </div>
      </div>

      {order.estimatedDelivery && (
        <div className="order-detail-row" style={{ marginBottom: 12 }}>
          <Clock size={16} /> <span className="order-detail-label">ETA:</span> {order.estimatedDelivery}
        </div>
      )}

      {/* Interactive Live Delivery Map with Real-Time Telematics */}
      <LiveDeliveryMap
        orderId={order.orderId}
        destinationAddress={order.deliveryAddress}
        destinationCity={order.destinationCity}
        driverLocation={driverLocation}
        status={currentStatus}
      />

      {/* Proof of Delivery (POD) Section */}
      {hasPodData && !isFailed && (
        <div
          style={{
            marginTop: 20,
            padding: 16,
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={20} color="#16a34a" />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#166534' }}>
                Proof of Delivery (POD)
              </h3>
            </div>
            {order.deliveredAt && (
              <span style={{ fontSize: 12, color: '#15803d', fontWeight: 500 }}>
                Delivered on {new Date(order.deliveredAt).toLocaleString()}
              </span>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
              marginTop: 12,
            }}
          >
            {/* Signature Preview */}
            <div style={{ background: '#ffffff', borderRadius: 8, padding: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 8 }}>
                <PenTool size={14} color="#2563eb" /> Recipient Signature
              </div>
              {order.proofOfDeliverySignature ? (
                <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 6, padding: 8, textAlign: 'center', minHeight: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img
                    src={order.proofOfDeliverySignature}
                    alt="Customer Signature"
                    style={{ maxWidth: '100%', maxHeight: 90, objectFit: 'contain' }}
                  />
                </div>
              ) : (
                <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 6, padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                  Direct Handover (Signature on file)
                </div>
              )}
              <div style={{ fontSize: 11, color: '#16a34a', marginTop: 6, textAlign: 'center', fontWeight: 500 }}>
                ✓ Identity Verified
              </div>
            </div>

            {/* Delivery Photo Preview */}
            <div style={{ background: '#ffffff', borderRadius: 8, padding: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 8 }}>
                <Camera size={14} color="#2563eb" /> Parcel Delivery Photo
              </div>
              {order.proofOfDeliveryPhoto ? (
                <div style={{ background: '#0f172a', borderRadius: 6, overflow: 'hidden', textAlign: 'center' }}>
                  <img
                    src={order.proofOfDeliveryPhoto}
                    alt="Delivery Drop-off"
                    style={{ width: '100%', maxHeight: 140, objectFit: 'contain', display: 'block' }}
                  />
                </div>
              ) : (
                <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 6, padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                  Standard In-Person Handover
                </div>
              )}
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, textAlign: 'center' }}>
                Drop-off location confirmed
              </div>
            </div>
          </div>

          {/* Delivery Notes */}
          {order.deliveryNotes && (
            <div style={{ marginTop: 12, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#334155', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <FileText size={15} color="#64748b" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <strong style={{ color: '#0f172a' }}>Driver Notes:</strong> {order.deliveryNotes}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delivery Failed Alert */}
      {isFailed && (
        <div
          style={{
            marginTop: 20,
            padding: 16,
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            color: '#991b1b',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 15 }}>
            <AlertCircle size={20} color="#dc2626" /> Delivery Incident Reported
          </div>
          {order.deliveryFailureReason && (
            <div style={{ marginTop: 8, fontSize: 13 }}>
              <strong>Failure Reason:</strong> {order.deliveryFailureReason}
            </div>
          )}
          {order.deliveryNotes && (
            <div style={{ marginTop: 4, fontSize: 13 }}>
              <strong>Driver Notes:</strong> {order.deliveryNotes}
            </div>
          )}
        </div>
      )}

      {/* Enhanced Event Sourcing Audit Trail Section */}
      <AuditTimeline events={events} loading={eventsLoading} />
    </div>
  );
};

export default OrderDetails;
