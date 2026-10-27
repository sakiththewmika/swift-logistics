import React from 'react';
import DeliveryItem from './DeliveryItem';
import { RefreshCw } from 'lucide-react';
import '../AppStyles.css';

const DeliveriesList = ({ deliveries, onStart, onComplete, onRefresh, onProof }) => (
  <div className="card">
    <div className="card-header-section">
      <div className="card-header">
        <h2 className="section-title">Today's Deliveries</h2>
        <button className="refresh-button" onClick={onRefresh}>
          <RefreshCw size={20} />
        </button>
      </div>
    </div>
    <div>
      {deliveries.map((delivery) => (
        <DeliveryItem
          key={delivery.id}
          delivery={delivery}
          onStart={onStart}
          onComplete={onComplete}
          onProof={onProof}
        />
      ))}
    </div>
  </div>
);

export default DeliveriesList;
