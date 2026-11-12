import { Router } from 'express';
import { z } from 'zod';
import { all, get, run } from '../db/index.js';
import { validate } from '../lib/validate.js';
import { ah, notFound, newId, now, readPaging, paginationMeta } from '../lib/http.js';
import { mapCommand, mapRun } from '../lib/mappers.js';
import { recordActivity } from '../lib/activity.js';
import { indexEntity, deleteEntity } from '../db/search.js';
import { evaluateCommand, ALLOWED_BINARIES } from '../lib/commandPolicy.js';
import { startRun, cancelRun } from '../lib/runner.js';
import { config } from '../config.js';

export const commandsRouter = Router();

const commandBody = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(120),
  description: z.string().max(2000).default(''),
  command: z.string().trim().min(1, 'Command is required').max(2000),
  cwd: z.string().max(400).nullish(),
  tags: z.array(z.string().trim().min(1).max(30)).max(15).default([]),
  projectId: z.string().nullish(),
  approved: z.boolean().default(false),
});

const runBody = z.object({
  commandId: z.string().nullish(),
  command: z.string().trim().min(1).max(2000).optional(),
  cwd: z.string().max(400).nullish(),
  projectId: z.string().nullish(),
  label: z.string().max(120).optional(),
  env: z.record(z.string(), z.string()).optional(),
  force: z.boolean().optional(),
});

function syncSearch(cmd) {
  indexEntity('command', {
    id: cmd.id,
    user_id: cmd.userId,
    project_id: cmd.projectId,
    title: cmd.name,
    body: `${cmd.command}\n${cmd.description}\n${cmd.tags.join(' ')}\n${cmd.cwd || ''}`,
    updated_at: cmd.updatedAt,
  });
}

commandsRouter.get(
  '/policy',
  ah(async (_req, res) => {
    res.json({
      data: {
        enabled: config.commandExecution.enabled,
        requireAllowlist: config.commandExecution.requireAllowlist,
        timeoutMs: config.commandExecution.timeoutMs,
        maxOutputBytes: config.commandExecution.maxOutputBytes,
        allowlist: ALLOWED_BINARIES,
      },
    });
  })
);

commandsRouter.get(
  '/',
  ah(async (req, res) => {
    const where = ['user_id = ?'];
    const params = [req.userId];
    if (req.query.projectId) {
      where.push('project_id = ?');
      params.push(req.query.projectId);
    }
    if (req.query.q) {
      where.push('(name LIKE ? OR command LIKE ? OR description LIKE ? OR tags LIKE ?)');
      const like = `%${req.query.q}%`;
      params.push(like, like, like, like);
    }
    if (req.query.tag) {
      where.push('tags LIKE ?');
      params.push(`%"${req.query.tag}"%`);
    }
    const rows = all(
      `SELECT * FROM commands WHERE ${where.join(' AND ')} ORDER BY approved DESC, updated_at DESC`,
      ...params
    );
    const projects = new Map(
      all('SELECT id, name, color FROM projects WHERE user_id = ?', req.userId).map((p) => [p.id, p])
    );
    const runCounts = all(
      `SELECT command_id, COUNT(*) AS c, MAX(started_at) AS last
       FROM command_runs WHERE user_id = ? GROUP BY command_id`,
      req.userId
    );
    const counts = new Map(runCounts.map((r) => [r.command_id, r]));
    res.json({
      data: rows.map((r) => {
        const c = mapCommand(r);
        const stats = counts.get(c.id);
        return {
          ...c,
          policy: evaluateCommand(c.command),
          projectName: projects.get(c.projectId)?.name ?? null,
          projectColor: projects.get(c.projectId)?.color ?? null,
          runCount: stats?.c ?? 0,
          lastRunAt: stats?.last ?? null,
        };
      }),
    });
  })
);

commandsRouter.get(
  '/runs',
  ah(async (req, res) => {
    const { page, pageSize, offset } = readPaging(req.query, 20);
    const where = ['r.user_id = ?'];
    const params = [req.userId];
    if (req.query.projectId) {
      where.push('r.project_id = ?');
      params.push(req.query.projectId);
    }
    if (req.query.status && req.query.status !== 'all') {
      where.push('r.status = ?');
      params.push(req.query.status);
    }
    if (req.query.q) {
      where.push('(r.command LIKE ? OR r.label LIKE ?)');
      params.push(`%${req.query.q}%`, `%${req.query.q}%`);
    }
    const whereSql = where.join(' AND ');
    const total = get(`SELECT COUNT(*) AS c FROM command_runs r WHERE ${whereSql}`, ...params).c;
    const rows = all(
      `SELECT r.* FROM command_runs r WHERE ${whereSql} ORDER BY r.started_at DESC LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      offset
    );
    res.json({ data: rows.map(mapRun), meta: paginationMeta(total, { page, pageSize }) });
  })
);

commandsRouter.get(
  '/runs/:id',
  ah(async (req, res) => {
    const row = get(
      'SELECT * FROM command_runs WHERE id = ? AND user_id = ?',
      req.params.id,
      req.userId
    );
    if (!row) throw notFound('Run not found');
    res.json({ data: mapRun(row) });
  })
);

// Dry-run the policy check so the UI can flag dangerous commands before running.
commandsRouter.post(
  '/check',
  ah(async (req, res) => {
    const { command } = validate(z.object({ command: z.string().max(2000) }), req.body);
    res.json({ data: evaluateCommand(command) });
  })
);

commandsRouter.post(
  '/',
  ah(async (req, res) => {
    const body = validate(commandBody, req.body);
    const policy = evaluateCommand(body.command);
    const id = newId();
    const ts = now();
    run(
      `INSERT INTO commands (id, user_id, project_id, name, description, command, cwd, tags, approved, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      req.userId,
      body.projectId || null,
      body.name,
      body.description,
      body.command,
      body.cwd || null,
      JSON.stringify(body.tags),
      body.approved && policy.allowed ? 1 : 0,
      ts,
      ts
    );
    const cmd = mapCommand(get('SELECT * FROM commands WHERE id = ?', id));
    syncSearch(cmd);
    recordActivity(req.userId, {
      type: 'command',
      projectId: cmd.projectId,
      title: `Saved command “${cmd.name}”`,
      description: cmd.command,
    });
    res.status(201).json({ data: { ...cmd, policy } });
  })
);

commandsRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const existing = get('SELECT * FROM commands WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!existing) throw notFound('Command not found');
    const body = validate(commandBody.partial(), req.body);
    const columns = {
      name: body.name,
      description: body.description,
      command: body.command,
      cwd: body.cwd === undefined ? undefined : body.cwd || null,
      tags: body.tags ? JSON.stringify(body.tags) : undefined,
      project_id: body.projectId === undefined ? undefined : body.projectId || null,
      approved: body.approved === undefined ? undefined : body.approved ? 1 : 0,
    };
    const keys = Object.keys(columns).filter((k) => columns[k] !== undefined);
    run(
      `UPDATE commands SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND user_id = ?`,
      ...keys.map((k) => columns[k]),
      now(),
      req.params.id,
      req.userId
    );
    const cmd = mapCommand(get('SELECT * FROM commands WHERE id = ?', req.params.id));
    syncSearch(cmd);
    res.json({ data: { ...cmd, policy: evaluateCommand(cmd.command) } });
  })
);

commandsRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const existing = get('SELECT * FROM commands WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!existing) throw notFound('Command not found');
    run('DELETE FROM commands WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    deleteEntity('command', req.params.id);
    res.json({ ok: true, id: req.params.id });
  })
);

commandsRouter.post(
  '/run',
  ah(async (req, res) => {
    const body = validate(runBody, req.body);
    let command = body.command;
    let cwd = body.cwd;
    let projectId = body.projectId;
    let label = body.label;
    let commandId = body.commandId;
    if (commandId) {
      const saved = get(
        'SELECT * FROM commands WHERE id = ? AND user_id = ?',
        commandId,
        req.userId
      );
      if (!saved) throw notFound('Command not found');
      command = saved.command;
      cwd = cwd || saved.cwd;
      projectId = projectId || saved.project_id;
      label = label || saved.name;
    }
    if (!command) throw notFound('No command provided');
    const result = startRun(req.userId, {
      command,
      cwd,
      projectId,
      commandId,
      label,
      env: body.env,
      force: body.force,
    });
    if (result.error) {
      return res.status(result.status).json({
        error: result.error,
        requiresConfirmation: result.requiresConfirmation || false,
        policy: result.policy,
      });
    }
    return res.status(202).json({ data: mapRun(result.run), policy: result.policy });
  })
);

commandsRouter.post(
  '/runs/:id/cancel',
  ah(async (req, res) => {
    const row = get('SELECT * FROM command_runs WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!row) throw notFound('Run not found');
    const ok = cancelRun(req.userId, req.params.id);
    res.json({ ok, data: { id: req.params.id, cancelled: ok } });
  })
);

commandsRouter.delete(
  '/runs/:id',
  ah(async (req, res) => {
    const row = get('SELECT * FROM command_runs WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!row) throw notFound('Run not found');
    run('DELETE FROM command_runs WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    res.json({ ok: true });
  })
);
