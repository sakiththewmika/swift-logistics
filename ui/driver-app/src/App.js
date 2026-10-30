import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthPage from './components/AuthPage';
import NextDeliveryCard from './components/NextDeliveryCard';
import DeliveriesList from './components/DeliveriesList';
import CurrentLocationCard from './components/CurrentLocationCard';
import StatusUpdateModal from './components/StatusUpdateModal';
import ProofOfDeliveryModal from './components/ProofOfDeliveryModal';
import { Truck, AlertTriangle, Radio, Shield, LogOut, CheckCircle2 } from 'lucide-react';
import './AppStyles.css';
import {
  getAssignedOrders,
  startDelivery,
  completeDelivery,
  submitProofOfDelivery,
} from './network/driver';
import { useDriverWebSocket } from './network/useDriverWebSocket';
import { WAREHOUSE_COORDS, resolveDestinationCoords } from './components/LiveDeliveryMap';

const MainDriverApp = () => {
  const { driver, logout } = useAuth();
  const [currentLocation, setCurrentLocation] = useState('Colombo Central Hub, Peliyagoda');
  const [deliveries, setDeliveries] = useState([]);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [showStatusUpdate, setShowStatusUpdate] = useState(false);
  const [showProofOfDelivery, setShowProofOfDelivery] = useState(false);
  const [proofDelivery, setProofDelivery] = useState(null);
  const [podMode, setPodMode] = useState('DELIVERED'); // 'DELIVERED' or 'FAILED'

  // Shared Live Telematics Simulation State
  const [isSimulating, setIsSimulating] = useState(false);
  const [simProgress, setSimProgress] = useState(0); // 0 to 100%
  const [driverCoords, setDriverCoords] = useState({
    latitude: WAREHOUSE_COORDS[0],
    longitude: WAREHOUSE_COORDS[1],
    speed: 0,
  });

  const simTimerRef = useRef(null);

  const handleDispatch = useCallback((dispatch) => {
    setDeliveries((prev) => {
      const existing = prev.find(
        (item) => (item.id ?? item.orderId) === dispatch.orderId
      );
      return existing
        ? prev.map((item) =>
            (item.id ?? item.orderId) === dispatch.orderId
              ? { ...item, ...dispatch }
              : item
          )
        : [...prev, dispatch];
    });
  }, []);

  // Poll for newly assigned orders every 5 seconds (syncs orders routed by Client Portal)
  useEffect(() => {
    if (driver?.driverId) {
      const fetchDeliveries = () => {
        getAssignedOrders(driver.driverId)
          .then((data) => setDeliveries(data || []))
          .catch(() => setDeliveries([]));
      };
      fetchDeliveries();
      const interval = setInterval(fetchDeliveries, 5000);
      return () => clearInterval(interval);
    }
  }, [driver]);

  const nextDelivery = deliveries.find(
    (d) =>
      d.status === 'ASSIGNED' ||
      d.status === 'ROUTED' ||
      d.status === 'READY' ||
      d.status === 'IN_TRANSIT'
  );

  const { connected: websocketConnected, publishLocation } = useDriverWebSocket(
    driver?.driverId,
    nextDelivery?.id ?? nextDelivery?.orderId,
    handleDispatch
  );

  // Stop simulation on unmount
  useEffect(() => {
    return () => {
      if (simTimerRef.current) clearInterval(simTimerRef.current);
    };
  }, []);

  // Shared simulation methods
  const startSimulation = useCallback(
    (targetDelivery) => {
      if (simTimerRef.current) clearInterval(simTimerRef.current);
      setIsSimulating(true);

      const deliveryObj = targetDelivery || nextDelivery;
      const destCoords = resolveDestinationCoords(
        deliveryObj?.deliveryAddress,
        deliveryObj?.destinationCity
      );
      const activeOrderId = deliveryObj?.id ?? deliveryObj?.orderId;

      const startLat = WAREHOUSE_COORDS[0];
      const startLng = WAREHOUSE_COORDS[1];
      const destLat = destCoords[0];
      const destLng = destCoords[1];

      let progress = simProgress >= 100 ? 0 : simProgress;
      setSimProgress(progress);

      simTimerRef.current = setInterval(() => {
        progress += 5;
        if (progress > 100) {
          progress = 100;
          clearInterval(simTimerRef.current);
          setIsSimulating(false);
        }

        const t = progress / 100;
        const lat = startLat + (destLat - startLat) * t;
        const lng = startLng + (destLng - startLng) * t;
        const speed = progress < 100 ? 44 + Math.floor(Math.random() * 8) : 0;

        const newCoords = { latitude: lat, longitude: lng, speed };
        setDriverCoords(newCoords);
        setSimProgress(progress);
        setCurrentLocation(`En route: ${deliveryObj?.deliveryAddress || 'Destination'}`);

        publishLocation(newCoords, activeOrderId);
      }, 2000);
    },
    [nextDelivery, simProgress, publishLocation]
  );

  const pauseSimulation = useCallback(() => {
    if (simTimerRef.current) clearInterval(simTimerRef.current);
    setIsSimulating(false);
  }, []);

  const toggleSimulation = useCallback(() => {
    if (isSimulating) {
      pauseSimulation();
    } else {
      startSimulation(nextDelivery);
    }
  }, [isSimulating, pauseSimulation, startSimulation, nextDelivery]);

  const fastForwardSimulation = useCallback(() => {
    if (simTimerRef.current) clearInterval(simTimerRef.current);
    setIsSimulating(false);
    const destCoords = resolveDestinationCoords(
      nextDelivery?.deliveryAddress,
      nextDelivery?.destinationCity
    );
    const activeOrderId = nextDelivery?.id ?? nextDelivery?.orderId;

    const startLat = WAREHOUSE_COORDS[0];
    const startLng = WAREHOUSE_COORDS[1];
    const destLat = destCoords[0];
    const destLng = destCoords[1];

    const t = 0.95;
    const lat = startLat + (destLat - startLat) * t;
    const lng = startLng + (destLng - startLng) * t;
    const coords = { latitude: lat, longitude: lng, speed: 20 };

    setSimProgress(95);
    setDriverCoords(coords);
    setCurrentLocation(`Arriving at ${nextDelivery?.deliveryAddress || 'Customer Destination'}`);
    publishLocation(coords, activeOrderId);
  }, [nextDelivery, publishLocation]);

  const resetToHub = useCallback(() => {
    if (simTimerRef.current) clearInterval(simTimerRef.current);
    setIsSimulating(false);
    setSimProgress(0);
    const coords = {
      latitude: WAREHOUSE_COORDS[0],
      longitude: WAREHOUSE_COORDS[1],
      speed: 0,
    };
    setDriverCoords(coords);
    setCurrentLocation('Colombo Central Hub, Peliyagoda');
    publishLocation(coords, nextDelivery?.id ?? nextDelivery?.orderId);
  }, [nextDelivery, publishLocation]);

  // Guided Action Progression: Step A
  const handleStartTrip = async (orderId) => {
    if (!orderId) return;
    try {
      await startDelivery(orderId);
      setDeliveries((prev) =>
        prev.map((d) =>
          (d.id ?? d.orderId) === orderId ? { ...d, status: 'IN_TRANSIT' } : d
        )
      );
      // Automatically launch the live GPS drive simulation
      startSimulation(nextDelivery);
    } catch (err) {
      console.error('Failed to start delivery trip:', err);
    }
  };

  // Guided Action Progression: Step B
  const handleOpenPod = (deliveryObj, mode = 'DELIVERED') => {
    setProofDelivery(deliveryObj);
    setPodMode(mode);
    setShowProofOfDelivery(true);
  };

  const submitProof = async (proof) => {
    const targetOrderId = proofDelivery.id ?? proofDelivery.orderId;
    await submitProofOfDelivery(driver.driverId, targetOrderId, proof);
    setDeliveries((prev) =>
      prev.map((item) =>
        (item.id ?? item.orderId) === targetOrderId
          ? { ...item, status: proof.status }
          : item
      )
    );
    setShowProofOfDelivery(false);
    setProofDelivery(null);
    pauseSimulation();
    if (proof.status === 'DELIVERED') {
      setSimProgress(100);
    }
  };

  const handleUpdateLocation = () => {
    setCurrentLocation('Peliyagoda Expressway, Colombo');
    publishLocation(driverCoords, nextDelivery?.id ?? nextDelivery?.orderId);
  };

  const handleRefresh = () => {
    if (driver?.driverId) {
      getAssignedOrders(driver.driverId)
        .then((data) => setDeliveries(data || []))
        .catch(() => setDeliveries([]));
    }
  };

  // Shift Stats
  const assignedCount = deliveries.filter(
    (d) =>
      d.status === 'ASSIGNED' ||
      d.status === 'ROUTED' ||
      d.status === 'READY'
  ).length;
  const inTransitCount = deliveries.filter((d) => d.status === 'IN_TRANSIT').length;
  const completedCount = deliveries.filter(
    (d) => d.status === 'COMPLETED' || d.status === 'DELIVERED'
  ).length;

  const driverDetails = driver || {
    driverName: 'Kasun Perera',
    driverId: 'DRV-001',
    vehicleId: 'WP-CAD-8842',
    phone: '+94 77 123 4567',
  };

  return (
    <div className="container" style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      {/* Modern Courier HUD Header */}
      <header
        className="header"
        style={{
          backgroundColor: '#0f172a',
          color: '#ffffff',
          padding: '16px 20px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div
          className="header-content"
          style={{
            maxWidth: 1000,
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                backgroundColor: '#1e293b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #334155',
              }}
            >
              <Truck size={24} color="#38bdf8" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                  {driverDetails.driverName}
                </h1>
                <span
                  style={{
                    backgroundColor: '#1e293b',
                    color: '#94a3b8',
                    fontFamily: 'monospace',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 4,
                    border: '1px solid #334155',
                  }}
                >
                  {driverDetails.vehicleId || 'WP-CAD-8842'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: websocketConnected ? '#10b981' : '#f59e0b',
                    boxShadow: websocketConnected ? '0 0 8px #10b981' : 'none',
                  }}
                />
                <span style={{ color: websocketConnected ? '#34d399' : '#fcd34d', fontSize: 12 }}>
                  {websocketConnected
                    ? 'Connected to Orchestrator :8080 (Live Telematics)'
                    : 'Connecting to STOMP Broker...'}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleRefresh}
              title="Refresh assigned jobs"
              style={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                color: '#f8fafc',
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Refresh
            </button>
            <button
              onClick={logout}
              title="Sign Out"
              style={{
                backgroundColor: '#ef4444',
                border: 'none',
                color: '#ffffff',
                padding: '8px 14px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* 3 Compact Shift Stats */}
        <div
          style={{
            maxWidth: 1000,
            margin: '16px auto 0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
          }}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #334155',
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc' }}>
              {assignedCount}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
              ASSIGNED / READY
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#1e293b',
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #334155',
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: '#38bdf8' }}>
              {inTransitCount}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
              IN TRANSIT (LIVE)
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#1e293b',
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #334155',
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: '#4ade80' }}>
              {completedCount}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
              COMPLETED TODAY
            </div>
          </div>
        </div>
      </header>

      {/* Main Courier Dashboard Content */}
      <main style={{ maxWidth: 1000, margin: '20px auto', padding: '0 16px' }}>
        {/* Step A & B: Guided Next Delivery Card */}
        <NextDeliveryCard
          delivery={nextDelivery}
          onStartTrip={handleStartTrip}
          onOpenPod={handleOpenPod}
          isSimulating={isSimulating}
          simProgress={simProgress}
          driverCoords={driverCoords}
          onToggleSim={toggleSimulation}
          onFastForward={fastForwardSimulation}
          onResetHub={resetToHub}
          websocketConnected={websocketConnected}
        />

        {/* Live Route & Telematics Map Card */}
        <CurrentLocationCard
          currentLocation={currentLocation}
          onUpdateLocation={handleUpdateLocation}
          delivery={nextDelivery}
          publishLocation={publishLocation}
          websocketConnected={websocketConnected}
          driverCoords={driverCoords}
          simProgress={simProgress}
          isSimulating={isSimulating}
          onToggleSim={toggleSimulation}
          onFastForward={fastForwardSimulation}
          onResetHub={resetToHub}
        />

        {/* Deliveries List */}
        <DeliveriesList
          deliveries={deliveries}
          onStart={(id) => handleStartTrip(id)}
          onComplete={(id) => handleOpenPod(deliveries.find((d) => (d.id ?? d.orderId) === id), 'DELIVERED')}
          onRefresh={handleRefresh}
          onProof={(d) => handleOpenPod(d, 'DELIVERED')}
        />
      </main>

      {/* Modals */}
      <StatusUpdateModal
        delivery={selectedDelivery}
        onInTransit={() => handleStartTrip(selectedDelivery?.id ?? selectedDelivery?.orderId)}
        onComplete={() => handleOpenPod(selectedDelivery, 'DELIVERED')}
        onFail={() => handleOpenPod(selectedDelivery, 'FAILED')}
        onCancel={() => setShowStatusUpdate(false)}
      />

      <ProofOfDeliveryModal
        delivery={showProofOfDelivery ? proofDelivery : null}
        initialMode={podMode}
        onSubmit={submitProof}
        onCancel={() => setShowProofOfDelivery(false)}
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
