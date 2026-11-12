import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { log } from './db/logger.js';
import { requireAuth } from './lib/auth.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { tasksRouter } from './routes/tasks.js';
import { commandsRouter } from './routes/commands.js';
import { notesRouter } from './routes/notes.js';
import { servicesRouter } from './routes/services.js';
import { githubRouter } from './routes/github.js';
import { dashboardRouter } from './routes/dashboard.js';
import { searchRouter } from './routes/search.js';
import { activityRouter } from './routes/activity.js';
import { eventsRouter } from './routes/events.js';
import { settingsRouter } from './routes/settings.js';

export function createApp() {
  migrate();
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(','), credentials: true }));
  app.use(express.json({ limit: '2mb' }));

  // Request logging with duration + request id.
  app.use((req, res, next) => {
    const started = Date.now();
    req.id = Math.random().toString(36).slice(2, 10);
    res.on('finish', () => {
      if (req.path.startsWith('/api')) {
        log.info('request', {
          id: req.id,
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          ms: Date.now() - started,
        });
      }
    });
    next();
  });

  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, name: 'devdeck', uptime: Math.round(process.uptime()), env: config.env })
  );

  app.use('/api/auth', authRouter);

  // Everything below requires a valid session — per-user isolation is enforced
  // again at the query level in every handler.
  const api = express.Router();
  api.use(requireAuth);
  api.use('/projects', projectsRouter);
  api.use('/tasks', tasksRouter);
  api.use('/commands', commandsRouter);
  api.use('/notes', notesRouter);
  api.use('/services', servicesRouter);
  api.use('/github', githubRouter);
  api.use('/dashboard', dashboardRouter);
  api.use('/search', searchRouter);
  api.use('/activity', activityRouter);
  api.use('/events', eventsRouter);
  api.use('/settings', settingsRouter);
  app.use('/api', api);

  app.use('/api', notFoundHandler);

  // Serve the built SPA when it exists (single-container deployment).
  if (fs.existsSync(config.webDist)) {
    app.use(express.static(config.webDist, { index: false, maxAge: '1h' }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      return res.sendFile(path.join(config.webDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = createApp();
  app.listen(config.port, config.host, () => {
    log.info(`DevDeck API listening on http://${config.host}:${config.port}`);
  });
}
