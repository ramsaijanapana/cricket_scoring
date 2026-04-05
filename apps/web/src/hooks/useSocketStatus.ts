import { useState, useEffect } from 'react';
import { getSocket } from '../lib/socket';

export type SocketStatus = 'connected' | 'reconnecting' | 'offline';

/**
 * Returns the current WebSocket connection status.
 * Combines Socket.IO events with navigator.onLine for a three-state indicator.
 */
export function useSocketStatus(): SocketStatus {
  const [status, setStatus] = useState<SocketStatus>(() => {
    if (!navigator.onLine) return 'offline';
    const s = getSocket();
    return s.connected ? 'connected' : 'reconnecting';
  });

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => setStatus('connected');
    const onDisconnect = () => {
      setStatus(navigator.onLine ? 'reconnecting' : 'offline');
    };
    const onReconnectAttempt = () => {
      if (navigator.onLine) setStatus('reconnecting');
    };
    const onOffline = () => setStatus('offline');
    const onOnline = () => {
      setStatus(socket.connected ? 'connected' : 'reconnecting');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('reconnect_attempt', onReconnectAttempt);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('reconnect_attempt', onReconnectAttempt);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  return status;
}
