/**
 * Local service monitoring. When a Docker daemon is reachable DevDeck reads
 * live container state; otherwise it serves the tracked service records so the
 * feature still works in demo/offline environments.
 */
import { Router } from 'express';
import { z } from 'zod';
import { all, get, run } from '../db/index.js';
import { validate } from '../lib/validate.js';
import { ah, notFound, newId, now } from '../lib/http.js';
import { mapService } from '../lib/mappers.js';
import { recordActivity } from '../lib/activity.js';
import { broadcast } from '../lib/realtime.js';
import { indexEntity } from '../db/search.js';
import { listContainers, dockerAvailable, containerAction } from '../lib/docker.js';

export const servicesRouter = Router();

const serviceBody = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['docker', 'process', 'database', 'tunnel']).default('docker'),
  containerId: z.string().max(120).nullish(),
  image: z.string().max(200).nullish(),
  ports: z.array(z.string().max(60)).max(20).default([]),
  projectId: z.string().nullish(),
  status: z.enum(['running', 'stopped', 'restarting', 'error']).default('stopped'),
  cpu: z.number().min(0).max(100).optional(),
  memoryMb: z.number().min(0).optional(),
});

function withProject(userId, rows) {
  const projects = new Map(
    all('SELECT id, name, color FROM projects WHERE user_id = ?', userId).map((p) => [p.id, p])
  );
  return rows.map((r) => {
    const s = mapService(r);
    return {
      ...s,
      projectName: projects.get(s.projectId)?.name ?? null,
      projectColor: projects.get(s.projectId)?.color ?? null,
      uptimeMs: s.startedAt && s.status === 'running' ? Date.now() - Date.parse(s.startedAt) : 0,
    };
  });
}

servicesRouter.get(
  '/',
  ah(async (req, res) => {
    const where = ['user_id = ?'];
    const params = [req.userId];
    if (req.query.projectId) {
      where.push('project_id = ?');
      params.push(req.query.projectId);
    }
    if (req.query.status && req.query.status !== 'all') {
      where.push('status = ?');
      params.push(req.query.status);
    }
    const rows = all(
      `SELECT * FROM services WHERE ${where.join(' AND ')} ORDER BY
        CASE status WHEN 'running' THEN 0 WHEN 'restarting' THEN 1 WHEN 'error' THEN 2 ELSE 3 END, name`,
      ...params
    );
    const dockerOnline = await dockerAvailable();
    res.json({ data: withProject(req.userId, rows), meta: { dockerConnected: dockerOnline } });
  })
);

servicesRouter.get(
  '/docker',
  ah(async (req, res) => {
    const status = await dockerAvailable();
    const containers = status.connected ? await listContainers() : [];
    res.json({
      data: {
        connected: status.connected,
        host: status.host,
        message: status.message,
        containers,
      },
    });
  })
);

servicesRouter.post(
  '/',
  ah(async (req, res) => {
    const body = validate(serviceBody, req.body);
    const id = newId();
    const ts = now();
    run(
      `INSERT INTO services (id, user_id, project_id, name, kind, container_id, image, ports, status, cpu, memory_mb, started_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      req.userId,
      body.projectId || null,
      body.name,
      body.kind,
      body.containerId || null,
      body.image || null,
      JSON.stringify(body.ports),
      body.status,
      body.cpu ?? 0,
      body.memoryMb ?? 0,
      body.status === 'running' ? ts : null,
      ts,
      ts
    );
    const row = get('SELECT * FROM services WHERE id = ?', id);
    const svc = mapService(row);
    indexEntity('service', {
      id: svc.id,
      user_id: req.userId,
      project_id: svc.projectId,
      title: svc.name,
      body: `${svc.image || ''} ${svc.ports.join(' ')} ${svc.status}`,
      updated_at: svc.updatedAt,
    });
    recordActivity(req.userId, {
      type: 'service',
      projectId: svc.projectId,
      title: `Tracked service ${svc.name}`,
      description: svc.image || '',
    });
    res.status(201).json({ data: svc });
  })
);

servicesRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const existing = get('SELECT * FROM services WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!existing) throw notFound('Service not found');
    const body = validate(serviceBody.partial(), req.body);
    const columns = {
      name: body.name,
      kind: body.kind,
      container_id: body.containerId === undefined ? undefined : body.containerId || null,
      image: body.image === undefined ? undefined : body.image || null,
      ports: body.ports ? JSON.stringify(body.ports) : undefined,
      project_id: body.projectId === undefined ? undefined : body.projectId || null,
      status: body.status,
      cpu: body.cpu,
      memory_mb: body.memoryMb,
    };
    const keys = Object.keys(columns).filter((k) => columns[k] !== undefined);
    run(
      `UPDATE services SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND user_id = ?`,
      ...keys.map((k) => columns[k]),
      now(),
      req.params.id,
      req.userId
    );
    res.json({ data: mapService(get('SELECT * FROM services WHERE id = ?', req.params.id)) });
  })
);

servicesRouter.post(
  '/:id/:action(start|stop|restart|inspect)',
  ah(async (req, res) => {
    const { id, action } = req.params;
    const existing = get('SELECT * FROM services WHERE id = ? AND user_id = ?', id, req.userId);
    if (!existing) throw notFound('Service not found');
    const ts = now();

    if (action === 'inspect') {
      const docker = await dockerAvailable();
      const containers = docker.connected ? await listContainers() : [];
      const detail = containers.find(
        (c) => c.id === existing.container_id || c.name === existing.name
      );
      return res.json({
        data: {
          service: mapService(existing),
          docker: docker.connected,
          container: detail || null,
        },
      });
    }

    // Attempt a real docker action when the daemon is reachable; otherwise just
    // update the tracked record so the UI stays consistent in demo mode.
    if (existing.container_id) await containerAction(existing.container_id, action);

    const nextStatus = action === 'stop' ? 'stopped' : 'running';
    run(
      `UPDATE services SET status = ?, started_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      nextStatus,
      nextStatus === 'running' ? ts : existing.started_at,
      ts,
      id,
      req.userId
    );
    const svc = mapService(get('SELECT * FROM services WHERE id = ?', id));
    recordActivity(req.userId, {
      type: 'service',
      projectId: svc.projectId,
      title: `${action === 'start' ? 'Started' : action === 'stop' ? 'Stopped' : 'Restarted'} ${svc.name}`,
    });
    broadcast(req.userId, 'service:updated', svc);
    return res.json({ data: svc });
  })
);

servicesRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const existing = get('SELECT * FROM services WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!existing) throw notFound('Service not found');
    run('DELETE FROM services WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    res.json({ ok: true, id: req.params.id });
  })
);
