/**
 * In-process pub/sub backing the Server-Sent Events stream. Each authenticated
 * user has their own topic so payloads never cross user boundaries.
 */
const clients = new Map(); // userId -> Set<res>

export function subscribe(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
  return () => {
    const set = clients.get(userId);
    if (!set) return;
    set.delete(res);
    if (!set.size) clients.delete(userId);
  };
}

export function broadcast(userId, event, data) {
  const set = clients.get(userId);
  if (!set || !set.size) return 0;
  const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(chunk);
    } catch {
      set.delete(res);
    }
  }
  return set.size;
}

export function connectionCount(userId) {
  return clients.get(userId)?.size ?? 0;
}

// Heartbeat keeps proxies from closing idle SSE connections.
setInterval(() => {
  for (const [userId, set] of clients) {
    for (const res of set) {
      try {
        res.write(`: ping ${Date.now()}\n\n`);
      } catch {
        set.delete(res);
        if (!set.size) clients.delete(userId);
      }
    }
  }
}, 25000).unref?.();
