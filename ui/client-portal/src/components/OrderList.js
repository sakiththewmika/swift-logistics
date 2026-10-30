import React, { useState, useMemo } from 'react';
import StatusBadge from './StatusBadge';
import { Search, MapPin, User, Package, AlertCircle, X, ChevronRight } from 'lucide-react';

const OrderList = ({
  orders = [],
  onSelect,
  selectedOrder,
  getStatusColor,
  getStatusIcon,
  formatStatus,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'IN_TRANSIT' | 'DELIVERED' | 'EXCEPTIONS'

  // Categorize orders for counts & filtering
  const categorized = useMemo(() => {
    const isTerminal = (status) =>
      ['DELIVERED', 'COMPLETED', 'FAILED', 'CANCELLED_REFUNDED'].includes(
        status?.toUpperCase()
      );
    const isInTransit = (status) =>
      ['IN_TRANSIT', 'DISPATCHED', 'OUT_FOR_DELIVERY'].includes(status?.toUpperCase());
    const isDelivered = (status) =>
      ['DELIVERED', 'COMPLETED'].includes(status?.toUpperCase());
    const isException = (status) => {
      const s = status?.toUpperCase() || '';
      return (
        s.includes('FAIL') ||
        s.includes('COMPENSAT') ||
        s.includes('CANCEL') ||
        s.includes('ROLLBACK') ||
        s.includes('REFUND')
      );
    };

    const counts = {
      ALL: orders.length,
      ACTIVE: orders.filter((o) => !isTerminal(o.status)).length,
      IN_TRANSIT: orders.filter((o) => isInTransit(o.status)).length,
      DELIVERED: orders.filter((o) => isDelivered(o.status)).length,
      EXCEPTIONS: orders.filter((o) => isException(o.status)).length,
    };

    const filtered = orders.filter((order) => {
      // Filter tab check
      const s = order.status?.toUpperCase() || '';
      if (activeFilter === 'ACTIVE' && isTerminal(s)) return false;
      if (activeFilter === 'IN_TRANSIT' && !isInTransit(s)) return false;
      if (activeFilter === 'DELIVERED' && !isDelivered(s)) return false;
      if (activeFilter === 'EXCEPTIONS' && !isException(s)) return false;

      // Search term check
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const idMatch = order.orderId?.toString().toLowerCase().includes(term);
      const addrMatch = order.deliveryAddress?.toLowerCase().includes(term);
      const cityMatch = order.destinationCity?.toLowerCase().includes(term);
      const driverMatch = order.driverName?.toLowerCase().includes(term);
      const statusMatch = order.status?.toLowerCase().includes(term);

      return idMatch || addrMatch || cityMatch || driverMatch || statusMatch;
    });

    return { counts, filtered };
  }, [orders, activeFilter, searchTerm]);

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 10,
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 220px)',
        minHeight: 680,
      }}
    >
      {/* Header & Search */}
      <div style={{ padding: '16px 16px 12px 16px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Package size={20} color="#2563eb" />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              Order Management
            </h2>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              backgroundColor: '#f1f5f9',
              color: '#475569',
              padding: '2px 8px',
              borderRadius: 12,
            }}
          >
            {categorized.filtered.length} of {orders.length}
          </span>
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative' }}>
          <Search
            size={16}
            color="#94a3b8"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search order ID, address, driver..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '8px 32px 8px 34px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              fontSize: 13,
              outline: 'none',
              backgroundColor: '#f8fafc',
            }}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: 2,
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter Tabs / Pills */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            marginTop: 10,
          }}
        >
          {[
            { id: 'ALL', label: 'All', count: categorized.counts.ALL },
            { id: 'ACTIVE', label: 'Active', count: categorized.counts.ACTIVE },
            { id: 'IN_TRANSIT', label: 'In Transit', count: categorized.counts.IN_TRANSIT },
            { id: 'DELIVERED', label: 'Delivered', count: categorized.counts.DELIVERED },
            { id: 'EXCEPTIONS', label: 'Issues', count: categorized.counts.EXCEPTIONS },
          ].map((pill) => {
            const isSelected = activeFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setActiveFilter(pill.id)}
                style={{
                  padding: '4px 9px',
                  borderRadius: 14,
                  fontSize: 11,
                  fontWeight: isSelected ? 600 : 500,
                  border: isSelected ? '1px solid #2563eb' : '1px solid #e2e8f0',
                  backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                  color: isSelected ? '#1d4ed8' : '#64748b',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{pill.label}</span>
                <span
                  style={{
                    fontSize: 10,
                    padding: '1px 5px',
                    borderRadius: 10,
                    backgroundColor: isSelected ? '#2563eb' : '#f1f5f9',
                    color: isSelected ? '#ffffff' : '#64748b',
                  }}
                >
                  {pill.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Order Cards List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
        {categorized.filtered.length === 0 ? (
          <div
            style={{
              padding: '36px 16px',
              textAlign: 'center',
              color: '#94a3b8',
              fontSize: 13,
            }}
          >
            <AlertCircle size={28} style={{ margin: '0 auto 8px auto', opacity: 0.5 }} />
            <div style={{ fontWeight: 600, color: '#64748b' }}>No orders found</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {searchTerm ? 'Try adjusting your search criteria' : 'No orders in this filter category'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {categorized.filtered.map((order) => {
              const isSelected = selectedOrder?.orderId === order.orderId;

              return (
                <div
                  key={order.orderId}
                  onClick={() => onSelect(order)}
                  style={{
                    backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                    border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '12px 14px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected
                      ? '0 4px 6px -1px rgba(37, 99, 235, 0.1), 0 2px 4px -2px rgba(37, 99, 235, 0.1)'
                      : 'none',
                  }}
                >
                  {/* Top Row: Order ID + Status Badge */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        fontSize: 13,
                        color: isSelected ? '#1d4ed8' : '#0f172a',
                      }}
                    >
                      {order.orderId}
                    </span>
                    <StatusBadge
                      status={order.status}
                      getStatusColor={getStatusColor}
                      getStatusIcon={getStatusIcon}
                      formatStatus={formatStatus}
                    />
                  </div>

                  {/* Middle Row: Delivery Address */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 12,
                      color: '#475569',
                      marginBottom: 8,
                    }}
                  >
                    <MapPin size={13} color="#64748b" style={{ flexShrink: 0 }} />
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {order.deliveryAddress || 'Colombo Delivery'}
                    </span>
                  </div>

                  {/* Bottom Row: Driver info + Total Amount */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 11,
                      color: '#64748b',
                      paddingTop: 6,
                      borderTop: '1px solid #f1f5f9',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <User size={12} />
                      <span>{order.driverName || order.driverId || 'Assigning...'}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 12 }}>
                        {order.totalAmount
                          ? `LKR ${Number(order.totalAmount).toLocaleString()}`
                          : 'LKR 0'}
                      </span>
                      <ChevronRight size={14} color={isSelected ? '#2563eb' : '#94a3b8'} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderList;
