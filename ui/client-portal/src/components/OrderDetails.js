import React from 'react';
import StatusBadge from './StatusBadge';
import { MapPin, User, Clock, Package, CheckCircle, FileText, AlertCircle, Camera, PenTool } from 'lucide-react';
import { orderEndpoints } from "../network/order";

const OrderDetails = ({ order, getStatusColor, getStatusIcon, formatStatus }) => {
  if (!order) return (
    <div className="order-details empty">
      <Package size={48} />
      <p>Select an order to view details</p>
    </div>
  );

  const handleTrack = async () => {
    if (order.orderId) {
      await orderEndpoints.trackOrder(order.orderId);
    }
  };

  const isDelivered = order.status === 'DELIVERED';
  const hasPodData = Boolean(
    order.proofOfDeliverySignature ||
    order.proofOfDeliveryPhoto ||
    order.deliveryNotes ||
    isDelivered
  );
  const isFailed = order.status === 'FAILED';

  return (
    <div className="order-details" key={order.orderId}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, color: '#1e293b' }}>Order Details</h2>
        <button className="create-order-btn" onClick={handleTrack} style={{ margin: 0 }}>
          Track Order
        </button>
      </div>

      <div className="order-detail-row">
        <span className="order-detail-label">Order ID:</span>
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>{order.orderId}</span>
      </div>

      <div className="order-detail-row">
        <span className="order-detail-label">Status:</span>
        <StatusBadge status={order.status} getStatusColor={getStatusColor} getStatusIcon={getStatusIcon} formatStatus={formatStatus} />
      </div>

      <div className="order-detail-row">
        <MapPin size={16} /> <span className="order-detail-label">Delivery Address:</span> {order.deliveryAddress || 'N/A'}
      </div>

      <div className="order-detail-row">
        <MapPin size={16} /> <span className="order-detail-label">City:</span> {order.city || 'Colombo'}
      </div>

      <div className="order-detail-row">
        <User size={16} /> <span className="order-detail-label">Driver:</span> {order.driverName || order.driverId || 'Not assigned'}
      </div>

      {order.vehicleId && (
        <div className="order-detail-row">
          <span className="order-detail-label" style={{ paddingLeft: 24 }}>Vehicle:</span> {order.vehicleId}
        </div>
      )}

      {order.totalAmount && (
        <div className="order-detail-row">
          <span className="order-detail-label" style={{ paddingLeft: 24 }}>Total Amount:</span>
          <strong>LKR {Number(order.totalAmount).toLocaleString()}</strong>
          <span style={{ fontSize: 11, color: '#16a34a', marginLeft: 6 }}>({order.billingStatus || 'PAID'})</span>
        </div>
      )}

      {order.estimatedDelivery && (
        <div className="order-detail-row">
          <Clock size={16} /> <span className="order-detail-label">ETA:</span> {order.estimatedDelivery}
        </div>
      )}

      <div className="order-detail-row">
        <span className="order-detail-label" style={{ paddingLeft: 24 }}>Created:</span> {order.createdAt ? new Date(order.createdAt).toLocaleString() : 'N/A'}
      </div>

      {/* Proof of Delivery (POD) Section */}
      {hasPodData && !isFailed && (
        <div
          style={{
            marginTop: 24,
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
    </div>
  );
};

export default OrderDetails;
