import React from 'react';
import {
  Navigation,
  MapPin,
  Clock,
  Phone,
  MessageSquare,
  Truck,
  CheckCircle,
  AlertTriangle,
  Play,
  Pause,
  FastForward,
  RotateCcw,
  Activity,
  PenTool,
} from 'lucide-react';
import '../AppStyles.css';

const NextDeliveryCard = ({
  delivery,
  onStartTrip,
  onOpenPod,
  isSimulating = false,
  simProgress = 0,
  driverCoords,
  onToggleSim,
  onFastForward,
  onResetHub,
  websocketConnected = false,
}) => {
  if (!delivery) {
    return (
      <div className="card" style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
        <CheckCircle size={40} color="#10b981" style={{ margin: '0 auto 10px auto' }} />
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1e293b' }}>
          All Assigned Deliveries Completed
        </h3>
        <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
          No active shipments en route. New orders dispatched by the central hub will appear here automatically.
        </p>
      </div>
    );
  }

  const deliveryId = delivery.id ?? delivery.orderId;
  const isInTransit = delivery.status === 'IN_TRANSIT';

  const getPriorityClass = (priority) => {
    switch (priority) {
      case 'HIGH':
        return 'priority-badge high';
      case 'MEDIUM':
        return 'priority-badge medium';
      case 'LOW':
        return 'priority-badge low';
      default:
        return 'priority-badge';
    }
  };

  return (
    <div className="next-delivery-card" style={{ borderRadius: 10, overflow: 'hidden' }}>
      {/* Card Header */}
      <div className="card-header" style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Navigation size={20} color="#2563eb" />
          <h2 className="section-title" style={{ margin: 0 }}>
            {isInTransit ? 'Active Delivery in Progress' : 'Next Assigned Delivery'}
          </h2>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 12,
              fontWeight: 700,
              backgroundColor: '#eff6ff',
              color: '#1d4ed8',
              padding: '2px 8px',
              borderRadius: 6,
            }}
          >
            {deliveryId}
          </span>
        </div>
        <span className={getPriorityClass(delivery.priority)}>
          {delivery.priority || 'NORMAL'} PRIORITY
        </span>
      </div>

      <div className="delivery-details">
        {/* Destination Address */}
        <div className="address-row">
          <MapPin size={22} color="#ef4444" className="address-icon" />
          <div>
            <p className="address-text">Delivery Destination</p>
            <p className="address-subtext" style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
              {delivery.deliveryAddress}
            </p>
          </div>
        </div>

        {/* ETA & Distance */}
        <div className="info-row">
          <span className="info-item">
            <Clock size={16} />
            {delivery.estimatedTime || '15-25 mins'}
          </span>
          <span className="info-item">
            <Navigation size={16} />
            {delivery.distance || '5.2 km'}
          </span>
          <span className="info-item" style={{ color: isInTransit ? '#2563eb' : '#64748b' }}>
            <Activity size={16} />
            Status: <strong>{delivery.status}</strong>
          </span>
        </div>

        {/* Recipient Details */}
        <div className="customer-row">
          <div>
            <p className="customer-info" style={{ fontWeight: 600 }}>
              {delivery.customerName || 'Customer Recipient'}
            </p>
            <p className="customer-phone">{delivery.customerPhone || '+94 77 123 4567'}</p>
          </div>
          <div className="contact-buttons">
            <a
              href={`tel:${delivery.customerPhone || '+94771234567'}`}
              className="contact-button phone-button"
              title="Call Recipient"
              style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Phone size={16} />
            </a>
            <a
              href={`sms:${delivery.customerPhone || '+94771234567'}`}
              className="contact-button message-button"
              title="SMS Recipient"
              style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <MessageSquare size={16} />
            </a>
          </div>
        </div>

        {/* Step B Telemetry Progress Bar & HUD (Active while IN_TRANSIT) */}
        {isInTransit && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#1e293b' }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: '#10b981',
                    boxShadow: '0 0 6px #10b981',
                  }}
                />
                <span>Route Telematics HUD: <strong>{simProgress}% Completed</strong></span>
              </div>
              <div style={{ color: '#475569' }}>
                Speed: <strong>{driverCoords?.speed || 45} km/h</strong>
              </div>
            </div>

            {/* Progress bar */}
            <div
              style={{
                width: '100%',
                height: 8,
                backgroundColor: '#e2e8f0',
                borderRadius: 4,
                overflow: 'hidden',
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  width: `${simProgress}%`,
                  height: '100%',
                  backgroundColor: simProgress >= 95 ? '#10b981' : '#2563eb',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>

            {/* Simulation controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={onToggleSim}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  fontSize: 11,
                  fontWeight: 600,
                  color: isSimulating ? '#dc2626' : '#2563eb',
                  cursor: 'pointer',
                }}
              >
                {isSimulating ? (
                  <>
                    <Pause size={12} /> Pause GPS Drive
                  </>
                ) : (
                  <>
                    <Play size={12} /> Resume GPS Drive
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onFastForward}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #bfdbfe',
                  backgroundColor: '#eff6ff',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#1d4ed8',
                  cursor: 'pointer',
                }}
                title="Fast forward simulation to 95% near customer doorstep"
              >
                <FastForward size={13} /> Fast-Forward Arrival (95%)
              </button>

              <button
                type="button"
                onClick={onResetHub}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#ffffff',
                  fontSize: 11,
                  color: '#64748b',
                  cursor: 'pointer',
                }}
                title="Reset vehicle coordinates back to Peliyagoda Hub"
              >
                <RotateCcw size={12} /> Reset Hub
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Guided Action Bar */}
      <div className="action-buttons" style={{ padding: '12px 16px', backgroundColor: '#ffffff', borderTop: '1px solid #f1f5f9' }}>
        {!isInTransit ? (
          /* Step A: Start Delivery Trip */
          <button
            onClick={() => onStartTrip(deliveryId)}
            className="primary-button"
            style={{
              width: '100%',
              backgroundColor: '#16a34a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: 14,
              fontWeight: 700,
              padding: '12px 16px',
            }}
          >
            <Truck size={18} />
            1. Start Delivery Trip (Mark In-Transit & Launch GPS)
          </button>
        ) : (
          /* Step B: Complete Delivery OR Report Failure */
          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            <button
              onClick={() => onOpenPod(delivery, 'DELIVERED')}
              className="success-button"
              style={{
                flex: 2,
                backgroundColor: '#16a34a',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '12px 14px',
                fontSize: 14,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
              }}
            >
              <PenTool size={16} />
              2. Complete Delivery (Capture Signature & Photo)
            </button>

            <button
              onClick={() => onOpenPod(delivery, 'FAILED')}
              style={{
                flex: 1,
                backgroundColor: '#ffffff',
                color: '#dc2626',
                border: '1px solid #fca5a5',
                borderRadius: 8,
                padding: '12px 14px',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
              title="Report customer unavailable, incorrect address, or damaged parcel"
            >
              <AlertTriangle size={15} />
              Report Failure
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NextDeliveryCard;
