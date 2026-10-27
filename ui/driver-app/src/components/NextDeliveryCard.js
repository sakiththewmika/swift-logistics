import React from 'react';
import { Navigation, MapPin, Clock, Phone, MessageSquare, Truck, CheckCircle } from 'lucide-react';
import '../AppStyles.css';

const NextDeliveryCard = ({ delivery, onStart, onComplete, onProof }) => {
  if (!delivery) return null;
  const deliveryId = delivery.id ?? delivery.orderId;
  const getPriorityClass = (priority) => {
    switch (priority) {
      case 'HIGH': return 'priority-badge high';
      case 'MEDIUM': return 'priority-badge medium';
      case 'LOW': return 'priority-badge low';
      default: return 'priority-badge';
    }
  };
  return (
    <div className="next-delivery-card">
      <div className="card-header">
        <h2 className="section-title">
          <Navigation size={20} color="#2563eb" />
          Next Delivery
        </h2>
        <span className={getPriorityClass(delivery.priority)}>
          {delivery.priority} PRIORITY
        </span>
      </div>
      <div className="delivery-details">
        <div className="address-row">
          <MapPin size={20} color="#ef4444" className="address-icon" />
          <div>
            <p className="address-text">Delivery Address</p>
            <p className="address-subtext">{delivery.deliveryAddress}</p>
          </div>
        </div>
        <div className="info-row">
          <span className="info-item">
            <Clock size={16} />
            {delivery.estimatedTime}
          </span>
          <span className="info-item">
            <Navigation size={16} />
            {delivery.distance}
          </span>
        </div>
        <div className="customer-row">
          <div>
            <p className="customer-info">{delivery.customerName}</p>
            <p className="customer-phone">{delivery.customerPhone}</p>
          </div>
          <div className="contact-buttons">
            <button className="contact-button phone-button">
              <Phone size={16} />
            </button>
            <button className="contact-button message-button">
              <MessageSquare size={16} />
            </button>
          </div>
        </div>
      </div>
      <div className="action-buttons">
        {delivery.status !== 'IN_TRANSIT' && (
          <button onClick={() => onStart(deliveryId)} className="primary-button">
            <Truck size={16} />
            Start Delivery
          </button>
        )}
        {delivery.status === 'IN_TRANSIT' && (
          <button onClick={() => onComplete(deliveryId)} className="success-button">
            <CheckCircle size={16} />
            Mark Complete
          </button>
        )}
        {delivery.status === 'IN_TRANSIT' && (
          <button onClick={() => onProof(delivery)} className="primary-button">
            Capture Proof of Delivery
          </button>
        )}
      </div>
    </div>
  );
};

export default NextDeliveryCard;
