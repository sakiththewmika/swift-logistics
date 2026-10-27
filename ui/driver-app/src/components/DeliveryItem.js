import React from 'react';
import { MapPin, Package } from 'lucide-react';
import '../AppStyles.css';

const DeliveryItem = ({ delivery, onStart, onComplete, onProof }) => {
  const deliveryId = delivery.id ?? delivery.orderId;
  const status = delivery.status ?? 'UNKNOWN';
  const items = Array.isArray(delivery.items) ? delivery.items : [];
  const getStatusClass = (status) => {
    switch (status) {
      case 'ASSIGNED': return 'status-badge assigned';
      case 'IN_TRANSIT': return 'status-badge in-transit';
      case 'COMPLETED': return 'status-badge completed';
      case 'FAILED': return 'status-badge failed';
      default: return 'status-badge';
    }
  };
  const getPriorityClass = (priority) => {
    switch (priority) {
      case 'HIGH': return 'status-badge high';
      case 'MEDIUM': return 'status-badge medium';
      case 'LOW': return 'status-badge low';
      default: return 'status-badge';
    }
  };
  return (
    <div className="delivery-item">
      <div className="delivery-item-header">
        <div>
          <h3 className="delivery-id">{deliveryId}</h3>
          <p className="customer-name">{delivery.customerName || 'Customer'}</p>
        </div>
        <div className="badge-container">
          <span className={getStatusClass(status)}>
            {status.replace('_', ' ')}
          </span>
          <span className={getPriorityClass(delivery.priority)}>
            {delivery.priority}
          </span>
        </div>
      </div>
      <div className="delivery-details2">
        <div className="detail-row">
          <MapPin size={16} color="#9ca3af" />
          <span>{delivery.deliveryAddress}</span>
        </div>
        <div className="detail-row">
          <Package size={16} color="#9ca3af" />
          <span>{items.length ? items.join(', ') : 'No package details'}</span>
        </div>
        {delivery.notes && (
          <div className="note">
            <p className="note-text">Note: {delivery.notes}</p>
          </div>
        )}
      </div>
      {(status === 'ASSIGNED' || status === 'ROUTED' || status === 'IN_TRANSIT') && (
        <div className="delivery-actions">
          {status !== 'IN_TRANSIT' && (
            <button onClick={() => onStart(deliveryId)} className="gray-button">
              Start
            </button>
          )}
          {status === 'IN_TRANSIT' && (
            <button onClick={() => onComplete(deliveryId)} className="small-success-button">
              Complete
            </button>
          )}
          {status === 'IN_TRANSIT' && (
            <button onClick={() => onProof(delivery)} className="gray-button">
              Proof
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default DeliveryItem;
