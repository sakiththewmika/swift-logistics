import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation, Truck, MapPin, Warehouse, Radio } from 'lucide-react';

export const WAREHOUSE_COORDS = [6.9585, 79.8845]; // Peliyagoda Central Hub, Colombo

export const resolveDestinationCoords = (address = '', city = '') => {
  const text = `${address} ${city}`.toLowerCase();
  if (text.includes('kandy') || text.includes('peradeniya')) {
    return [7.2906, 80.6337];
  }
  if (text.includes('galle') || text.includes('rampart') || text.includes('fort rampart')) {
    return [6.0535, 80.2210];
  }
  if (text.includes('bambalapitiya') || text.includes('colombo 04') || text.includes('colombo 4') || text.includes('bauddhaloka')) {
    return [6.8905, 79.8587];
  }
  if (text.includes('cinnamon') || text.includes('colombo 07') || text.includes('colombo 7') || text.includes('ward place')) {
    return [6.9080, 79.8690];
  }
  if (text.includes('fort') || text.includes('colombo 01') || text.includes('colombo 1') || text.includes('pettah')) {
    return [6.9344, 79.8428];
  }
  if (text.includes('nugegoda') || text.includes('high level')) {
    return [6.8649, 79.8997];
  }
  if (text.includes('dehiwala') || text.includes('mount lavinia')) {
    return [6.8301, 79.8801];
  }
  // Default Colombo 03 / Kollupitiya / Galle Road
  return [6.9022, 79.8518];
};

const createWarehouseIcon = () =>
  L.divIcon({
    className: 'custom-warehouse-marker',
    html: `
      <div style="background:#2563eb; color:white; width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 10px rgba(37,99,235,0.45); border:2px solid white;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17],
  });

const createDestinationIcon = () =>
  L.divIcon({
    className: 'custom-destination-marker',
    html: `
      <div style="background:#ef4444; color:white; width:34px; height:34px; border-radius:50% 50% 50% 0; transform:rotate(-45deg); display:flex; align-items:center; justify-content:center; box-shadow:0 3px 10px rgba(239,68,68,0.45); border:2px solid white;">
        <div style="transform:rotate(45deg); display:flex; align-items:center; justify-content:center;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
        </div>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -34],
  });

const createTruckIcon = (speed = 0) =>
  L.divIcon({
    className: 'custom-truck-marker',
    html: `
      <div style="position:relative; width:40px; height:40px;">
        <div style="position:absolute; inset:-4px; border-radius:50%; background:#10b981; opacity:0.35; animation:leaflet-ping 1.6s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <div style="position:relative; background:#059669; color:white; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(5,150,105,0.5); border:2px solid white;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="1" y="3" width="15" height="13"></rect>
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
            <circle cx="5.5" cy="18.5" r="2.5"></circle>
            <circle cx="18.5" cy="18.5" r="2.5"></circle>
          </svg>
        </div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });

const LiveDeliveryMap = ({
  orderId,
  destinationAddress,
  destinationCity,
  driverLocation,
  status,
  height = '340px',
}) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const truckMarkerRef = useRef(null);
  const routeLineRef = useRef(null);

  const destCoords = resolveDestinationCoords(destinationAddress, destinationCity);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Determine initial truck coordinates
    let initialTruckCoords = WAREHOUSE_COORDS;
    if (driverLocation?.latitude && driverLocation?.longitude) {
      initialTruckCoords = [driverLocation.latitude, driverLocation.longitude];
    } else if (status === 'DELIVERED') {
      initialTruckCoords = destCoords;
    } else if (status === 'IN_TRANSIT') {
      // 40% along the route
      initialTruckCoords = [
        WAREHOUSE_COORDS[0] + (destCoords[0] - WAREHOUSE_COORDS[0]) * 0.4,
        WAREHOUSE_COORDS[1] + (destCoords[1] - WAREHOUSE_COORDS[1]) * 0.4,
      ];
    }

    // Initialize Map
    const map = L.map(mapContainerRef.current, {
      center: WAREHOUSE_COORDS,
      zoom: 13,
      zoomControl: true,
      attributionControl: false,
    });

    // Tile Layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    // Warehouse Marker
    const warehouseMarker = L.marker(WAREHOUSE_COORDS, {
      icon: createWarehouseIcon(),
    }).addTo(map);
    warehouseMarker.bindPopup(`
      <div style="font-family:sans-serif; font-size:12px; line-height:1.4;">
        <strong style="color:#2563eb;">🏬 SwiftLogistics Central Hub</strong><br/>
        Peliyagoda Fulfilment Center, Colombo<br/>
        <span style="color:#64748b; font-size:11px;">Origin Hub (WMS Automated)</span>
      </div>
    `);

    // Destination Marker
    const destMarker = L.marker(destCoords, {
      icon: createDestinationIcon(),
    }).addTo(map);
    destMarker.bindPopup(`
      <div style="font-family:sans-serif; font-size:12px; line-height:1.4;">
        <strong style="color:#ef4444;">📍 Customer Destination</strong><br/>
        ${destinationAddress || 'Colombo Delivery Address'}<br/>
        <span style="color:#64748b; font-size:11px;">${destinationCity || 'Colombo'}</span>
      </div>
    `);

    // Route Polyline
    const routeLine = L.polyline([WAREHOUSE_COORDS, destCoords], {
      color: '#2563eb',
      weight: 4,
      opacity: 0.75,
      dashArray: '8, 8',
      lineCap: 'round',
    }).addTo(map);
    routeLineRef.current = routeLine;

    // Truck Marker
    const truckMarker = L.marker(initialTruckCoords, {
      icon: createTruckIcon(driverLocation?.speed || 0),
      zIndexOffset: 1000,
    }).addTo(map);
    truckMarker.bindPopup(`
      <div style="font-family:sans-serif; font-size:12px; line-height:1.4;">
        <strong style="color:#059669;">🚚 Swift Express Delivery Van</strong><br/>
        Status: <strong>${status || 'IN_TRANSIT'}</strong><br/>
        <span style="color:#64748b; font-size:11px;">GPS Live Telematics</span>
      </div>
    `);
    truckMarkerRef.current = truckMarker;

    // Fit map bounds to encompass warehouse and destination
    const bounds = L.latLngBounds([WAREHOUSE_COORDS, destCoords]);
    if (initialTruckCoords) {
      bounds.extend(initialTruckCoords);
    }
    map.fitBounds(bounds, { padding: [45, 45], maxZoom: 14 });

    mapInstanceRef.current = map;

    // Invalidate size after layout settles
    const resizeTimer = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 150);

    return () => {
      clearTimeout(resizeTimer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update truck position dynamically when driverLocation changes
  useEffect(() => {
    if (!truckMarkerRef.current || !driverLocation) return;
    const { latitude, longitude, speed } = driverLocation;
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      truckMarkerRef.current.setLatLng([latitude, longitude]);
      const speedText = speed ? `${Math.round(speed)} km/h` : 'Moving';
      truckMarkerRef.current.setPopupContent(`
        <div style="font-family:sans-serif; font-size:12px; line-height:1.4;">
          <strong style="color:#059669;">🚚 Swift Express Live Telematics</strong><br/>
          Speed: <strong>${speedText}</strong><br/>
          GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}<br/>
          <span style="color:#10b981; font-size:11px; font-weight:600;">● Active Route Broadcast</span>
        </div>
      `);
    }
  }, [driverLocation]);

  const hasLiveGps = Boolean(driverLocation?.latitude && driverLocation?.longitude);

  return (
    <div style={{ marginTop: 20, marginBottom: 20 }}>
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          borderRadius: '8px 8px 0 0',
          fontSize: 13,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Navigation size={16} color="#38bdf8" />
          <span style={{ fontWeight: 600 }}>Live Telematics & Dispatch Map</span>
          {orderId && (
            <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
              ({orderId})
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: hasLiveGps || status === 'IN_TRANSIT' ? '#10b981' : '#64748b',
                boxShadow:
                  hasLiveGps || status === 'IN_TRANSIT' ? '0 0 8px #10b981' : 'none',
              }}
            />
            <span style={{ color: hasLiveGps || status === 'IN_TRANSIT' ? '#34d399' : '#94a3b8' }}>
              {hasLiveGps
                ? `Live GPS Stream (${driverLocation.speed ? Math.round(driverLocation.speed) : 40} km/h)`
                : status === 'IN_TRANSIT'
                ? 'En Route to Destination'
                : status === 'DELIVERED'
                ? 'Delivered at Destination'
                : 'Awaiting Driver Dispatch'}
            </span>
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div
        ref={mapContainerRef}
        style={{
          height,
          width: '100%',
          borderRadius: '0 0 8px 8px',
          border: '1px solid #0f172a',
          borderTop: 'none',
          position: 'relative',
          zIndex: 1,
        }}
      />

      {/* Route Key Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderTop: 'none',
          borderRadius: '0 0 8px 8px',
          fontSize: 12,
          color: '#475569',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: 2,
              backgroundColor: '#2563eb',
            }}
          />
          <strong>Warehouse:</strong> Peliyagoda Hub
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: '#ef4444',
            }}
          />
          <strong>Destination:</strong> {destinationAddress || 'Customer Address'}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: '#059669',
            }}
          />
          <strong>Truck:</strong>{' '}
          {driverLocation
            ? `${driverLocation.latitude.toFixed(4)}, ${driverLocation.longitude.toFixed(4)}`
            : status === 'DELIVERED'
            ? 'Handover Completed'
            : 'En Route'}
        </div>
      </div>
    </div>
  );
};

export default LiveDeliveryMap;

