import React from 'react';
import {
  Navigation,
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Activity,
  MapPin,
} from 'lucide-react';
import LiveDeliveryMap, { WAREHOUSE_COORDS, resolveDestinationCoords } from './LiveDeliveryMap';
import '../AppStyles.css';

const CurrentLocationCard = ({
  currentLocation,
  onUpdateLocation,
  delivery,
  publishLocation,
  websocketConnected = false,
  driverCoords = { latitude: WAREHOUSE_COORDS[0], longitude: WAREHOUSE_COORDS[1], speed: 0 },
  simProgress = 0,
  isSimulating = false,
  onToggleSim,
  onFastForward,
  onResetHub,
}) => {
  const deliveryAddress = delivery?.deliveryAddress || '42 Galle Road, Colombo 03';
  const destinationCoords = resolveDestinationCoords(deliveryAddress, delivery?.destinationCity);
  const activeOrderId = delivery?.id ?? delivery?.orderId;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Navigation size={20} color="#2563eb" />
            Live Route & Telematics Map
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: websocketConnected ? '#10b981' : '#f59e0b',
                boxShadow: websocketConnected ? '0 0 6px #10b981' : 'none',
              }}
            />
            <span style={{ color: websocketConnected ? '#15803d' : '#b45309', fontWeight: 600 }}>
              {websocketConnected ? 'STOMP Telemetry Active (:8080)' : 'Connecting STOMP...'}
            </span>
          </div>
        </div>

        <p className="current-location-text" style={{ margin: '8px 0 12px 0', fontSize: 13, color: '#475569' }}>
          {currentLocation || 'Colombo Central Hub, Peliyagoda'}
          {activeOrderId && (
            <span style={{ marginLeft: 6, fontFamily: 'monospace', color: '#2563eb', fontWeight: 600 }}>
              [Order: {activeOrderId}]
            </span>
          )}
        </p>

        {/* Embedded Leaflet Map */}
        <LiveDeliveryMap
          destinationAddress={deliveryAddress}
          destinationCity={delivery?.destinationCity}
          driverLocation={driverCoords}
          height="280px"
        />

        {/* Simulation Controls & Status */}
        <div
          style={{
            marginTop: 14,
            padding: 12,
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Activity size={16} color={isSimulating ? '#16a34a' : '#64748b'} className={isSimulating ? 'spin' : ''} />
              <span>Route Simulation: <strong>{simProgress}% Complete</strong></span>
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Speed: <strong style={{ color: '#0f172a' }}>{driverCoords.speed} km/h</strong>
            </div>
          </div>

          {/* Progress Bar */}
          <div
            style={{
              width: '100%',
              height: 6,
              backgroundColor: '#e2e8f0',
              borderRadius: 3,
              overflow: 'hidden',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                width: `${simProgress}%`,
                height: '100%',
                backgroundColor: simProgress >= 100 ? '#10b981' : '#2563eb',
                transition: 'width 0.4s ease',
              }}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              onClick={onToggleSim}
              style={{
                flex: 1,
                minWidth: 160,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '9px 14px',
                backgroundColor: isSimulating ? '#dc2626' : '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isSimulating ? (
                <>
                  <Pause size={14} /> Pause Simulation
                </>
              ) : (
                <>
                  <Play size={14} /> Resume Route Drive
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onFastForward}
              title="Fast forward simulation to arrival"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '9px 12px',
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                color: '#1d4ed8',
                cursor: 'pointer',
              }}
            >
              <FastForward size={13} /> Fast-Forward
            </button>

            <button
              type="button"
              onClick={onResetHub}
              title="Reset coordinates to Peliyagoda Hub"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '9px 12px',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                fontSize: 12,
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={14} /> Reset Hub
            </button>

            {onUpdateLocation && (
              <button
                type="button"
                className="location-button"
                onClick={onUpdateLocation}
                style={{ margin: 0, padding: '9px 12px', fontSize: 12 }}
              >
                Manual GPS Ping
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CurrentLocationCard;
