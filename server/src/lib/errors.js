import { HttpError } from './http.js';
import { log } from '../db/logger.js';

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Route not found' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const status = err instanceof HttpError ? err.status : err.status || 500;
  if (status >= 500) {
    log.error('request failed', { path: req.path, method: req.method, error: err.message, stack: err.stack });
  } else {
    log.debug('request rejected', { path: req.path, method: req.method, error: err.message });
  }
  res.status(status).json({
    error: status >= 500 && process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    ...(err.details ? { details: err.details } : {}),
  });
}
