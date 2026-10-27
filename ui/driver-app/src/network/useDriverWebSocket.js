import { useEffect, useRef, useState } from 'react';
import { Client } from '@stomp/stompjs';

const websocketUrl = process.env.REACT_APP_ORCHESTRATOR_WS_URL || 'ws://localhost:8000/ws';

export const useDriverWebSocket = (driverId, orderId, onDispatch, onLocation) => {
  const clientRef = useRef(null);
  const latestPositionRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!driverId) return undefined;

    const client = new Client({
      brokerURL: websocketUrl,
      reconnectDelay: 5000,
      onConnect: () => {
        setConnected(true);
        client.subscribe(`/topic/drivers/${driverId}/dispatch`, message => {
          onDispatch?.(JSON.parse(message.body));
        });
        client.subscribe(`/topic/drivers/${driverId}/location`, message => {
          onLocation?.(JSON.parse(message.body));
        });
      },
      onDisconnect: () => setConnected(false),
      onWebSocketClose: () => setConnected(false),
      onStompError: frame => console.error('Driver WebSocket error:', frame.headers.message),
    });

    client.activate();
    clientRef.current = client;

    let watchId;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        position => {
          latestPositionRef.current = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            speed: position.coords.speed ?? 0,
            heading: position.coords.heading ?? 0,
          };
        },
        error => console.warn('Unable to read driver location:', error.message),
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
      );
    }

    const telemetryTimer = window.setInterval(() => {
      const position = latestPositionRef.current;
      if (position && client.connected) {
        client.publish({
          destination: '/app/telemetry',
          body: JSON.stringify({
            driverId, orderId, ...position, timestamp: new Date().toISOString()
          }),
        });
      }
    }, 3000);

    return () => {
      window.clearInterval(telemetryTimer);
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      client.deactivate();
      clientRef.current = null;
      setConnected(false);
    };
  }, [driverId, orderId, onDispatch, onLocation]);

  return connected;
};
