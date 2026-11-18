import { useEffect, useRef, useState, useCallback } from 'react';
import { Client } from '@stomp/stompjs';

const websocketUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:8080/ws';

/**
 * Keeps one STOMP connection per signed-in driver.
 *
 * The connection depends only on `driverId`. The active order id, the callbacks and the
 * "pause GPS" flag are read through refs, so changing the active delivery never tears the
 * socket down and reconnects it.
 *
 * `pauseGpsPublishing` suppresses the periodic raw browser-geolocation telemetry. Set it while the
 * route simulator is publishing, otherwise the customer's map would jump between the real device
 * position and the simulated one.
 */
export const useDriverWebSocket = (
  driverId,
  orderId,
  onDispatch,
  onLocation,
  pauseGpsPublishing = false
) => {
  const clientRef = useRef(null);
  const latestPositionRef = useRef(null);
  const orderIdRef = useRef(orderId);
  const onDispatchRef = useRef(onDispatch);
  const onLocationRef = useRef(onLocation);
  const pauseGpsRef = useRef(pauseGpsPublishing);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    orderIdRef.current = orderId;
  }, [orderId]);
  useEffect(() => {
    onDispatchRef.current = onDispatch;
    onLocationRef.current = onLocation;
  }, [onDispatch, onLocation]);
  useEffect(() => {
    pauseGpsRef.current = pauseGpsPublishing;
  }, [pauseGpsPublishing]);

  const publishLocation = useCallback((coords, activeOrderId) => {
    const targetOrderId = activeOrderId || orderIdRef.current;
    if (clientRef.current && clientRef.current.connected && driverId && coords) {
      clientRef.current.publish({
        destination: '/app/telemetry',
        body: JSON.stringify({
          driverId,
          orderId: targetOrderId,
          latitude: coords.latitude,
          longitude: coords.longitude,
          speed: coords.speed ?? 45,
          heading: coords.heading ?? 0,
          timestamp: new Date().toISOString(),
        }),
      });
    }
  }, [driverId]);

  useEffect(() => {
    if (!driverId) return undefined;

    const client = new Client({
      brokerURL: websocketUrl,
      reconnectDelay: 5000,
      onConnect: () => {
        setConnected(true);
        client.subscribe(`/topic/drivers/${driverId}/dispatch`, message => {
          onDispatchRef.current?.(JSON.parse(message.body));
        });
        client.subscribe(`/topic/drivers/${driverId}/location`, message => {
          onLocationRef.current?.(JSON.parse(message.body));
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
      if (position && client.connected && !pauseGpsRef.current) {
        client.publish({
          destination: '/app/telemetry',
          body: JSON.stringify({
            driverId,
            orderId: orderIdRef.current,
            ...position,
            timestamp: new Date().toISOString(),
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
  }, [driverId]);

  return { connected, publishLocation };
};
