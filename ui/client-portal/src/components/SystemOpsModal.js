import React, { useState, useEffect } from 'react';
import {
  Activity,
  Server,
  ExternalLink,
  RefreshCw,
  Play,
  CheckCircle,
  AlertCircle,
  ShieldCheck,
  Terminal,
  X,
  Layers,
  Database,
  Radio,
} from 'lucide-react';
import { orderEndpoints } from '../network/order';

const SystemOpsModal = ({ onClose, onOrderCreated, customerId = 'CUST-001' }) => {
  const [activeTab, setActiveTab] = useState('scenarios'); // 'scenarios' | 'dlq' | 'infra'
  
  // Health status state
  const [healthStatus, setHealthStatus] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // DLQ Replay state
  const [selectedQueue, setSelectedQueue] = useState('order.dlq');
  const [replayLimit, setReplayLimit] = useState(10);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayResult, setReplayResult] = useState(null);

  // Scenario 1: Happy path state
  const [happyPathLoading, setHappyPathLoading] = useState(false);
  const [happyPathResult, setHappyPathResult] = useState(null);

  // Scenario 2: Idempotency duplicate test state
  const [idempotencyLoading, setIdempotencyLoading] = useState(false);
  const [idempotencyResult, setIdempotencyResult] = useState(null);

  // Fetch health check on mount
  useEffect(() => {
    checkSystemHealth();
  }, []);

  const checkSystemHealth = async () => {
    setHealthLoading(true);
    try {
      const res = await orderEndpoints.checkHealth();
      setHealthStatus({ success: true, data: res });
    } catch (err) {
      setHealthStatus({ success: false, error: err.message });
    } finally {
      setHealthLoading(false);
    }
  };

  // Replay DLQ handler
  const handleReplayDlq = async () => {
    setReplayLoading(true);
    setReplayResult(null);
    try {
      const res = await orderEndpoints.replayDlq(selectedQueue, replayLimit);
      setReplayResult({
        success: true,
        queue: selectedQueue,
        replayed: res?.replayed ?? 0,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      setReplayResult({
        success: false,
        queue: selectedQueue,
        error: err.message || 'Failed to trigger DLQ replay',
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setReplayLoading(false);
    }
  };

  // 1-Click Scenario A: Standard Express Order (Happy Path)
  const handleRunHappyPath = async () => {
    setHappyPathLoading(true);
    setHappyPathResult(null);
    const idempotencyKey = `idem-express-${Date.now()}`;
    const payload = {
      customerId: customerId || 'CUST-001',
      pickupAddress: 'Peliyagoda Fulfilment Hub, Colombo',
      deliveryAddress: '42 Galle Road, Colombo 03',
      destinationCity: 'Colombo',
      priority: 'HIGH',
      items: [
        { name: 'Dell UltraSharp 27" 4K Monitor', quantity: 1, price: 95000.0, weight: 6.5 },
      ],
      totalAmount: 95000.0,
      notes: 'Express VIP delivery with Fragile handling',
    };

    try {
      const order = await orderEndpoints.createOrder(payload, {
        'Idempotency-Key': idempotencyKey,
      });
      setHappyPathResult({
        success: true,
        idempotencyKey,
        orderId: order?.orderId,
        status: order?.status || 'NEW',
        totalAmount: order?.totalAmount,
        timestamp: new Date().toLocaleTimeString(),
      });
      onOrderCreated?.(order);
    } catch (err) {
      setHappyPathResult({
        success: false,
        idempotencyKey,
        error: err.message || 'Failed to create express order',
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setHappyPathLoading(false);
    }
  };

  // 1-Click Scenario B: Duplicate Idempotency Guard Test
  const handleRunIdempotencyTest = async () => {
    setIdempotencyLoading(true);
    setIdempotencyResult(null);
    const duplicateKey = `idem-dup-test-${Date.now()}`;
    const payload = {
      customerId: customerId || 'CUST-001',
      pickupAddress: 'Peliyagoda Fulfilment Hub, Colombo',
      deliveryAddress: '15 Bauddhaloka Mawatha, Colombo 04',
      destinationCity: 'Colombo',
      priority: 'MEDIUM',
      items: [{ name: 'Logitech MX Master 3S', quantity: 1, price: 28000.0, weight: 0.4 }],
      totalAmount: 28000.0,
    };

    try {
      // Fire two concurrent POST requests with the identical key
      const [res1, res2] = await Promise.allSettled([
        orderEndpoints.createOrder(payload, { 'Idempotency-Key': duplicateKey }),
        orderEndpoints.createOrder(payload, { 'Idempotency-Key': duplicateKey }),
      ]);

      const req1Success = res1.status === 'fulfilled';
      const req2Success = res2.status === 'fulfilled';

      const order1Id = req1Success ? res1.value?.orderId : null;
      const order2Id = req2Success ? res2.value?.orderId : null;

      // Both must point to the same orderId, or one throws 409 conflict
      const isProtected =
        (order1Id && order2Id && order1Id === order2Id) ||
        (req1Success && !req2Success && (res2.reason?.status === 409 || res2.reason?.message?.includes('409'))) ||
        (!req1Success && req2Success && (res1.reason?.status === 409 || res1.reason?.message?.includes('409')));

      setIdempotencyResult({
        success: true,
        isProtected,
        duplicateKey,
        req1: {
          status: req1Success ? '201 Created' : res1.reason?.status || 'Rejected',
          orderId: order1Id || res1.reason?.message,
        },
        req2: {
          status: req2Success ? (order1Id === order2Id ? '200 OK (Cached)' : '201 Created') : res2.reason?.status || 'Rejected (409 Conflict)',
          orderId: order2Id || res2.reason?.message,
        },
        timestamp: new Date().toLocaleTimeString(),
      });

      if (order1Id || order2Id) {
        onOrderCreated?.(res1.value || res2.value);
      }
    } catch (err) {
      setIdempotencyResult({
        success: false,
        error: err.message,
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setIdempotencyLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 12,
          maxWidth: 860,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid #cbd5e1',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            backgroundColor: '#0f172a',
            color: '#f8fafc',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #1e293b',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                backgroundColor: '#1e293b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #334155',
              }}
            >
              <Activity size={20} color="#38bdf8" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#f8fafc' }}>
                Middleware Architecture & Chaos Recovery Console
              </h2>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                Transactional Outbox, Distributed Sagas, DLQ Recovery & Telematics Observability
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Close Console"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            backgroundColor: '#f1f5f9',
            borderBottom: '1px solid #e2e8f0',
            padding: '0 16px',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('scenarios')}
            style={{
              padding: '12px 16px',
              border: 'none',
              borderBottom: activeTab === 'scenarios' ? '2px solid #2563eb' : '2px solid transparent',
              background: 'transparent',
              color: activeTab === 'scenarios' ? '#2563eb' : '#64748b',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <ShieldCheck size={16} /> 1-Click Test Scenarios
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('dlq')}
            style={{
              padding: '12px 16px',
              border: 'none',
              borderBottom: activeTab === 'dlq' ? '2px solid #2563eb' : '2px solid transparent',
              background: 'transparent',
              color: activeTab === 'dlq' ? '#2563eb' : '#64748b',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <RefreshCw size={16} /> Dead-Letter Queue (DLQ) Replay
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('infra')}
            style={{
              padding: '12px 16px',
              border: 'none',
              borderBottom: activeTab === 'infra' ? '2px solid #2563eb' : '2px solid transparent',
              background: 'transparent',
              color: activeTab === 'infra' ? '#2563eb' : '#64748b',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Server size={16} /> Infrastructure Quick-Links
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
          {/* TAB 1: 1-Click Architecture Test Scenarios */}
          {activeTab === 'scenarios' && (
            <div>
              <div
                style={{
                  padding: 12,
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  marginBottom: 16,
                  fontSize: 13,
                  color: '#475569',
                }}
              >
                Trigger end-to-end distributed system operations to demonstrate the
                <strong> Orchestrator Saga pattern</strong>, <strong>SOAP/TCP/REST polyglot coordination</strong>, and
                <strong> idempotency guarantees</strong> during live interviews.
              </div>

              {/* Scenario 1: Happy Path Order */}
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 16,
                  backgroundColor: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#0f172a' }}>
                      Scenario A: Standard Express Order (Happy Path Saga)
                    </h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#64748b' }}>
                      Generates a unique <code>Idempotency-Key</code> and submits a Colombo order. Triggers full
                      orchestration: CMS SOAP Billing → WMS TCP Inventory → ROS Optimization.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRunHappyPath}
                    disabled={happyPathLoading}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      padding: '8px 14px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: happyPathLoading ? 'not-allowed' : 'pointer',
                      opacity: happyPathLoading ? 0.7 : 1,
                    }}
                  >
                    <Play size={14} fill="#ffffff" />
                    {happyPathLoading ? 'Orchestrating...' : 'Launch Happy Path'}
                  </button>
                </div>

                {happyPathResult && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 12,
                      backgroundColor: happyPathResult.success ? '#f0fdf4' : '#fef2f2',
                      border: `1px solid ${happyPathResult.success ? '#bbf7d0' : '#fecaca'}`,
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  >
                    {happyPathResult.success ? (
                      <div>
                        <div style={{ color: '#166534', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <CheckCircle size={15} color="#16a34a" /> Order Created & Dispatched!
                        </div>
                        <div style={{ marginTop: 6, color: '#334155' }}>
                          Order ID: <strong style={{ fontFamily: 'monospace' }}>{happyPathResult.orderId}</strong> |
                          Status: <strong>{happyPathResult.status}</strong> |
                          Amount: LKR {Number(happyPathResult.totalAmount).toLocaleString()}
                        </div>
                        <div style={{ marginTop: 4, color: '#64748b', fontSize: 11 }}>
                          Key: <code>{happyPathResult.idempotencyKey}</code> | Timestamp: {happyPathResult.timestamp}
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: '#991b1b' }}>
                        <strong>Error:</strong> {happyPathResult.error}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Scenario 2: Idempotency Guard Test */}
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: 16,
                  backgroundColor: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#0f172a' }}>
                      Scenario B: Idempotency Guard Test (Concurrent Duplicate Key)
                    </h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#64748b' }}>
                      Dispatches TWO simultaneous HTTP POST requests sharing the exact same <code>Idempotency-Key</code> to
                      verify the backend MongoDB unique lock prevents double billing.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRunIdempotencyTest}
                    disabled={idempotencyLoading}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      backgroundColor: '#7c3aed',
                      color: '#ffffff',
                      border: 'none',
                      padding: '8px 14px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: idempotencyLoading ? 'not-allowed' : 'pointer',
                      opacity: idempotencyLoading ? 0.7 : 1,
                    }}
                  >
                    <ShieldCheck size={14} />
                    {idempotencyLoading ? 'Testing...' : 'Test Duplicate Guard'}
                  </button>
                </div>

                {idempotencyResult && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 12,
                      backgroundColor: idempotencyResult.isProtected ? '#f0fdf4' : '#fffbeb',
                      border: `1px solid ${idempotencyResult.isProtected ? '#bbf7d0' : '#fde68a'}`,
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  >
                    <div
                      style={{
                        color: idempotencyResult.isProtected ? '#166534' : '#b45309',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 6,
                      }}
                    >
                      <CheckCircle size={15} color={idempotencyResult.isProtected ? '#16a34a' : '#d97706'} />
                      {idempotencyResult.isProtected
                        ? 'Idempotency Guard Verified: Exactly 1 Order Created!'
                        : 'Duplicate Check Response Received'}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                      <div style={{ background: '#ffffff', padding: 8, borderRadius: 4, border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>REQUEST 1</span>
                        <strong>{idempotencyResult.req1.status}</strong>
                        <div style={{ fontSize: 11, color: '#334155', fontFamily: 'monospace', marginTop: 2 }}>
                          {idempotencyResult.req1.orderId}
                        </div>
                      </div>

                      <div style={{ background: '#ffffff', padding: 8, borderRadius: 4, border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>REQUEST 2 (DUPLICATE)</span>
                        <strong>{idempotencyResult.req2.status}</strong>
                        <div style={{ fontSize: 11, color: '#334155', fontFamily: 'monospace', marginTop: 2 }}>
                          {idempotencyResult.req2.orderId}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>
                      Shared Key: <code>{idempotencyResult.duplicateKey}</code> | Timestamp: {idempotencyResult.timestamp}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Dead-Letter Queue (DLQ) Replay */}
          {activeTab === 'dlq' && (
            <div>
              <div
                style={{
                  padding: 12,
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  marginBottom: 16,
                  fontSize: 13,
                  color: '#475569',
                }}
              >
                In an event-driven architecture, poisoned or failed messages are routed to
                RabbitMQ Dead-Letter Queues (DLQ) after retry exhaustion. Use this console to manually replay
                DLQ messages back into their active processing exchange via <code>RecoveryController</code>.
              </div>

              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: 16,
                  backgroundColor: '#ffffff',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                      Target Dead-Letter Queue
                    </label>
                    <select
                      value={selectedQueue}
                      onChange={(e) => setSelectedQueue(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        fontSize: 13,
                        backgroundColor: '#ffffff',
                      }}
                    >
                      <option value="order.dlq">order.dlq (Saga Orchestration DLQ)</option>
                      <option value="warehouse.dlq">warehouse.dlq (WMS TCP Socket DLQ)</option>
                      <option value="route.dlq">route.dlq (ROS Optimization DLQ)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                      Replay Limit
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={replayLimit}
                      onChange={(e) => setReplayLimit(Number(e.target.value) || 10)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        fontSize: 13,
                      }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleReplayDlq}
                  disabled={replayLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    padding: '9px 16px',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: replayLoading ? 'not-allowed' : 'pointer',
                    opacity: replayLoading ? 0.7 : 1,
                  }}
                >
                  <RefreshCw size={14} className={replayLoading ? 'spin' : ''} />
                  {replayLoading ? 'Replaying Messages...' : 'Replay Dead-Letter Messages'}
                </button>

                {replayResult && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 12,
                      backgroundColor: replayResult.success ? '#f0fdf4' : '#fef2f2',
                      border: `1px solid ${replayResult.success ? '#bbf7d0' : '#fecaca'}`,
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  >
                    {replayResult.success ? (
                      <div>
                        <div style={{ color: '#166534', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <CheckCircle size={15} color="#16a34a" /> Replay Command Executed Successfully
                        </div>
                        <div style={{ marginTop: 4, color: '#334155' }}>
                          Queue: <code>{replayResult.queue}</code> | Messages Replayed: <strong>{replayResult.replayed}</strong>
                        </div>
                        <div style={{ marginTop: 2, color: '#64748b', fontSize: 11 }}>
                          Timestamp: {replayResult.timestamp}
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: '#991b1b' }}>
                        <strong>Error:</strong> {replayResult.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Infrastructure Quick-Links & Live Health */}
          {activeTab === 'infra' && (
            <div>
              {/* Orchestrator Health Status Pill */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: healthStatus?.success ? '#10b981' : '#ef4444',
                      boxShadow: healthStatus?.success ? '0 0 6px #10b981' : 'none',
                    }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                    Orchestrator Backend:
                  </span>
                  <span style={{ fontSize: 13, color: healthStatus?.success ? '#15803d' : '#b91c1c' }}>
                    {healthStatus?.success ? `UP (${healthStatus.data?.service || 'Orchestrator'})` : 'Offline / Checking...'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={checkSystemHealth}
                  disabled={healthLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    padding: '5px 10px',
                    fontSize: 11,
                    color: '#475569',
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={12} className={healthLoading ? 'spin' : ''} /> Ping Health
                </button>
              </div>

              {/* Grid of Links */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Zipkin */}
                <a
                  href="http://localhost:9411"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    padding: 14,
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#ffffff',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, color: '#0f172a' }}>
                      <Activity size={18} color="#f97316" /> OpenZipkin
                    </div>
                    <ExternalLink size={14} color="#64748b" />
                  </div>
                  <p style={{ margin: '6px 0 0 0', fontSize: 12, color: '#64748b' }}>
                    Distributed trace spans across Spring Boot, RabbitMQ, and down to SOAP & TCP adapters.
                  </p>
                  <span style={{ fontSize: 11, color: '#2563eb', marginTop: 8, display: 'inline-block' }}>
                    http://localhost:9411 →
                  </span>
                </a>

                {/* Consul */}
                <a
                  href="http://localhost:8500"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    padding: 14,
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#ffffff',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, color: '#0f172a' }}>
                      <Layers size={18} color="#ec4899" /> HashiCorp Consul
                    </div>
                    <ExternalLink size={14} color="#64748b" />
                  </div>
                  <p style={{ margin: '6px 0 0 0', fontSize: 12, color: '#64748b' }}>
                    Service discovery registry, distributed KV store, and continuous health heartbeat monitoring.
                  </p>
                  <span style={{ fontSize: 11, color: '#2563eb', marginTop: 8, display: 'inline-block' }}>
                    http://localhost:8500 →
                  </span>
                </a>

                {/* RabbitMQ */}
                <a
                  href="http://localhost:15672"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    padding: 14,
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#ffffff',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, color: '#0f172a' }}>
                      <Database size={18} color="#f59e0b" /> RabbitMQ Management
                    </div>
                    <ExternalLink size={14} color="#64748b" />
                  </div>
                  <p style={{ margin: '6px 0 0 0', fontSize: 12, color: '#64748b' }}>
                    Inspect message queues, exchange routing, unacknowledged buffers, and DLQs (default: guest:guest).
                  </p>
                  <span style={{ fontSize: 11, color: '#2563eb', marginTop: 8, display: 'inline-block' }}>
                    http://localhost:15672 →
                  </span>
                </a>

                {/* Actuator */}
                <a
                  href="http://localhost:8000/actuator/health"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    padding: 14,
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#ffffff',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, color: '#0f172a' }}>
                      <Terminal size={18} color="#10b981" /> Spring Boot Actuator
                    </div>
                    <ExternalLink size={14} color="#64748b" />
                  </div>
                  <p style={{ margin: '6px 0 0 0', fontSize: 12, color: '#64748b' }}>
                    Production metrics, CircuitBreaker state (Resilience4j), and thread pool telemetry.
                  </p>
                  <span style={{ fontSize: 11, color: '#2563eb', marginTop: 8, display: 'inline-block' }}>
                    http://localhost:8000/actuator/health →
                  </span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 12,
            color: '#64748b',
          }}
        >
          <span>SwiftLogistics Orchestrator Enterprise Architecture Console</span>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 14px',
              backgroundColor: '#e2e8f0',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SystemOpsModal;

