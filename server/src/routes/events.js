import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { subscribe } from '../lib/realtime.js';

export const eventsRouter = Router();

/** Server-Sent Events stream, scoped to the authenticated user. */
eventsRouter.get('/', requireAuth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`retry: 3000\n\n`);
  res.write(`event: ready\ndata: ${JSON.stringify({ userId: req.userId, at: Date.now() })}\n\n`);
  const unsubscribe = subscribe(req.userId, res);
  req.on('close', () => {
    unsubscribe();
    res.end();
  });
});
