import { useEffect, useRef, useState } from 'react';
import { getToken } from './api.js';

/**
 * Subscribe to the authenticated user's SSE stream. Reconnects automatically
 * and exposes a connection state for the UI ("Live" indicator).
 */
export function useRealtime(handlers = {}) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(handlers);
  handlerRef.current = handlers;
  const [lastEvent, setLastEvent] = useState(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return undefined;
    let source;
    let retry;
    let closed = false;

    const connect = () => {
      if (closed) return;
      source = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
      source.addEventListener('ready', () => setConnected(true));
      source.onerror = () => {
        setConnected(false);
        source.close();
        if (!closed) retry = setTimeout(connect, 4000);
      };
      const events = ['activity:new', 'service:updated', 'command:output', 'command:done', 'task:updated'];
      for (const name of events) {
        source.addEventListener(name, (event) => {
          try {
            const data = JSON.parse(event.data);
            setLastEvent({ name, data, at: Date.now() });
            handlerRef.current[name]?.(data);
          } catch {
            /* ignore malformed payloads */
          }
        });
      }
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      source?.close();
    };
  }, []);

  return { connected, lastEvent };
}
