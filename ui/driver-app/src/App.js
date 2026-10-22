import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthPage from './components/AuthPage';
import NextDeliveryCard from './components/NextDeliveryCard';
import DeliveriesList from './components/DeliveriesList';
import CurrentLocationCard from './components/CurrentLocationCard';
import StatusUpdateModal from './components/StatusUpdateModal';
import { Truck, AlertTriangle } from 'lucide-react';
import './AppStyles.css';
import { getAssignedOrders, startDelivery, completeDelivery } from './network/driver';

const MainDriverApp = () => {
  const { driver, logout } = useAuth();
  const [currentLocation, setCurrentLocation] = useState('Colombo 03, Sri Lanka');
  const [deliveries, setDeliveries] = useState([]);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [showStatusUpdate, setShowStatusUpdate] = useState(false);

  useEffect(() => {
    if (driver?.driverId) {
      getAssignedOrders(driver.driverId)
        .then(data => setDeliveries(data || []))
        .catch(() => setDeliveries([]));
    }
  }, [driver]);

  const nextDelivery = deliveries.find(d => d.status === 'ASSIGNED' || d.status === 'ROUTED');
  const completedCount = deliveries.filter(d => d.status === 'COMPLETED' || d.status === 'DELIVERED').length;
  const pendingCount = deliveries.filter(d => d.status === 'ASSIGNED' || d.status === 'ROUTED').length;

  const updateDeliveryStatus = async (orderId, newStatus) => {
    if (!orderId) return;

    try {
      if (newStatus === 'IN_TRANSIT') {
        await startDelivery(orderId);
      } else if (newStatus === 'COMPLETED') {
        await completeDelivery(orderId);
      } else {
        return;
      }

      setDeliveries(prev => prev.map(delivery =>
        (delivery.id ?? delivery.orderId) === orderId
          ? { ...delivery, status: newStatus === 'COMPLETED' ? 'DELIVERED' : newStatus }
          : delivery
      ));
      setShowStatusUpdate(false);
      setSelectedDelivery(null);
    } catch (error) {
      console.error(`Failed to update delivery ${orderId}`, error);
    }
  };

  const handleUpdateLocation = () => {
    // Simulate location update
    setCurrentLocation('Updated Location, Sri Lanka');
    alert('Location updated!');
  };

  const handleRefresh = () => {
    // Simulate refresh
    if (driver?.driverId) {
      getAssignedOrders(driver.driverId)
        .then(data => setDeliveries(data || []))
        .catch(() => setDeliveries([]));
    }
  };

  // Use driver details from auth context if available
  const driverDetails = driver || { name: 'Kasun Perera', id: 'DRV-001', phone: '+94 77 123 4567' };

  return (
    <div className="container">
      <header className="header">
        <div className="header-content">
          <div className="driver-info">
            <div className="truck-icon">
              <Truck size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>Driver Dashboard</h1>
              <p style={{ color: '#bfdbfe', fontSize: '14px', margin: 0 }}>{driverDetails.driverName}</p>
            </div>
          </div>
          <div className="buttons">
            <button className="settings-button" onClick={logout} title="Sign Out">
              Sign Out
            </button>
          </div>
        </div>
        <div className="stats">
          <div className="stat-card">
            <div className="stat-number">{completedCount}</div>
            <div className="stat-label">Completed</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{pendingCount}</div>
            <div className="stat-label">Pending</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">5.2</div>
            <div className="stat-label">Rating</div>
          </div>
        </div>
      </header>
      <div className="main">
        <NextDeliveryCard
          delivery={nextDelivery}
          onStart={() => updateDeliveryStatus(nextDelivery?.id ?? nextDelivery?.orderId, 'IN_TRANSIT')}
          onComplete={() => updateDeliveryStatus(nextDelivery?.id ?? nextDelivery?.orderId, 'COMPLETED')}
        />
        <DeliveriesList
          deliveries={deliveries}
          onStart={id => updateDeliveryStatus(id, 'IN_TRANSIT')}
          onComplete={id => updateDeliveryStatus(id, 'COMPLETED')}
          onRefresh={handleRefresh}
        />
        <CurrentLocationCard
          currentLocation={currentLocation}
          onUpdateLocation={handleUpdateLocation}
        />
      </div>
      <StatusUpdateModal
        delivery={selectedDelivery}
        onInTransit={() => updateDeliveryStatus(selectedDelivery?.id ?? selectedDelivery?.orderId, 'IN_TRANSIT')}
        onComplete={() => updateDeliveryStatus(selectedDelivery?.id ?? selectedDelivery?.orderId, 'COMPLETED')}
        onFail={() => updateDeliveryStatus(selectedDelivery?.id ?? selectedDelivery?.orderId, 'FAILED')}
        onCancel={() => setShowStatusUpdate(false)}
      />
    </div>
  );
};

const App = () => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <MainDriverApp /> : <AuthPage />;
};

const Root = () => (
  <AuthProvider>
    <App />
  </AuthProvider>
);

export default Root;
