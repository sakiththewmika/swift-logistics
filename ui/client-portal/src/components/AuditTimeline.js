import React from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Activity,
  ArrowRight
} from 'lucide-react';

const getTierBadge = (source) => {
  const norm = (source || '').toUpperCase();
  if (norm.includes('CMS')) {
    return { label: 'CMS-SOAP', bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd' };
  }
  if (norm.includes('WMS')) {
    return { label: 'WMS-TCP', bg: '#fef3c7', color: '#b45309', border: '#fde68a' };
  }
  if (norm.includes('ROS')) {
    return { label: 'ROS-REST', bg: '#ede9fe', color: '#6d28d9', border: '#ddd6fe' };
  }
  if (norm.includes('DRIVER')) {
    return { label: 'DRIVER-APP', bg: '#d1fae5', color: '#047857', border: '#a7f3d0' };
  }
  if (norm.includes('CLIENT')) {
    return { label: 'CLIENT-PORTAL', bg: '#dbeafe', color: '#1d4ed8', border: '#bfdbfe' };
  }
  return { label: 'ORCHESTRATOR', bg: '#e0e7ff', color: '#4338ca', border: '#c7d2fe' };
};

const formatEventType = (eventType) => {
  if (!eventType) return '';
  return eventType
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const formatTimestamp = (ts) => {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
      ' (' + d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ')';
  } catch {
    return ts;
  }
};

const AuditTimeline = ({ events = [], loading = false }) => {
  if (loading) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
        <Clock size={18} style={{ animation: 'spin 1.5s linear infinite', marginBottom: 6 }} />
        <div>Loading Saga audit events...</div>
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: 8, fontSize: 13 }}>
        No audit events recorded yet for this order.
      </div>
    );
  }

  // Sort events chronologically (oldest first) so the lifecycle flows naturally
  const chronological = [...events].sort(
    (a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
  );

  // Compute delta between consecutive events
  const enrichedEvents = chronological.map((evt, idx) => {
    let delta = 'Start';
    if (idx > 0) {
      const prev = new Date(chronological[idx - 1].timestamp || 0).getTime();
      const curr = new Date(evt.timestamp || 0).getTime();
      const diffSec = Math.max(0, (curr - prev) / 1000);
      if (diffSec < 60) {
        delta = `+${diffSec.toFixed(1)}s`;
      } else if (diffSec < 3600) {
        const mins = Math.floor(diffSec / 60);
        const secs = Math.round(diffSec % 60);
        delta = `+${mins}m ${secs}s`;
      } else {
        delta = `+${(diffSec / 3600).toFixed(1)}h`;
      }
    }
    return { ...evt, timeDelta: delta };
  });

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={18} color="#2563eb" />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
            Event Sourcing Audit Trail
          </h3>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 12,
              backgroundColor: '#eff6ff',
              color: '#2563eb',
              border: '1px solid #bfdbfe',
            }}
          >
            {enrichedEvents.length} Events
          </span>
        </div>
        <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>Chronological order</span>
          <ArrowRight size={12} />
        </div>
      </div>

      <div style={{ position: 'relative', paddingLeft: 20 }}>
        {/* Continuous vertical timeline connector line */}
        <div
          style={{
            position: 'absolute',
            left: 7,
            top: 14,
            bottom: 24,
            width: 2,
            backgroundColor: '#e2e8f0',
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {enrichedEvents.map((evt, index) => {
            const badge = getTierBadge(evt.source);
            const isFailed = evt.status === 'FAILED';
            const isSuccess = evt.status === 'SUCCESS';

            return (
              <div
                key={evt.eventId || index}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                {/* Timeline node icon */}
                <div
                  style={{
                    position: 'absolute',
                    left: -20,
                    top: 10,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2,
                  }}
                >
                  {isFailed ? (
                    <AlertCircle size={16} color="#ef4444" />
                  ) : isSuccess ? (
                    <CheckCircle2 size={16} color="#10b981" />
                  ) : (
                    <Clock size={16} color="#f59e0b" />
                  )}
                </div>

                {/* Event Card */}
                <div
                  style={{
                    flex: 1,
                    backgroundColor: '#ffffff',
                    border: isFailed ? '1px solid #fecaca' : '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '10px 14px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* Microservice Tier Badge */}
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 4,
                          backgroundColor: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`,
                          letterSpacing: '0.02em',
                        }}
                      >
                        {badge.label}
                      </span>

                      {/* Event Type */}
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                        {formatEventType(evt.eventType)}
                      </span>
                    </div>

                    {/* Time Delta Pill */}
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        fontFamily: 'monospace',
                        padding: '2px 6px',
                        borderRadius: 4,
                        backgroundColor: index === 0 ? '#f1f5f9' : '#f0fdf4',
                        color: index === 0 ? '#64748b' : '#15803d',
                        border: index === 0 ? '1px solid #e2e8f0' : '1px solid #bbf7d0',
                      }}
                      title={index === 0 ? 'Order initiated' : `Elapsed since previous event`}
                    >
                      {evt.timeDelta}
                    </span>
                  </div>

                  {/* Description */}
                  <div style={{ fontSize: 13, color: isFailed ? '#b91c1c' : '#475569', marginBottom: 6 }}>
                    {evt.description}
                  </div>

                  {/* Footer with timestamp and event ID */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
                    <span>{formatTimestamp(evt.timestamp)}</span>
                    {evt.eventId && (
                      <span style={{ fontFamily: 'monospace' }}>ID: {evt.eventId.slice(0, 8)}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AuditTimeline;
