import { Router } from 'express';
import { z } from 'zod';
import { all, get, run } from '../db/index.js';
import { validate } from '../lib/validate.js';
import { ah, notFound, newId, now, badRequest, readPaging, paginationMeta } from '../lib/http.js';
import { mapTask } from '../lib/mappers.js';
import { recordActivity } from '../lib/activity.js';
import { indexEntity, deleteEntity } from '../db/search.js';

export const tasksRouter = Router();

const taskBody = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().max(8000).default(''),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done']).default('todo'),
  dueDate: z.string().nullish(),
  projectId: z.string().nullish(),
});

function syncSearch(task) {
  indexEntity('task', {
    id: task.id,
    user_id: task.userId,
    project_id: task.projectId,
    title: task.title,
    body: `${task.description}\nstatus: ${task.status} priority: ${task.priority}`,
    updated_at: task.updatedAt,
  });
}

function decorate(userId, rows) {
  const projectNames = new Map(
    all('SELECT id, name, color FROM projects WHERE user_id = ?', userId).map((p) => [p.id, p])
  );
  return rows.map((r) => {
    const t = mapTask(r);
    const p = projectNames.get(t.projectId);
    return { ...t, projectName: p?.name ?? null, projectColor: p?.color ?? null };
  });
}

function assertProject(userId, projectId) {
  if (!projectId) return null;
  const row = get('SELECT id FROM projects WHERE id = ? AND user_id = ?', projectId, userId);
  if (!row) throw badRequest('Project not found');
  return projectId;
}

tasksRouter.get(
  '/',
  ah(async (req, res) => {
    const { page, pageSize, offset } = readPaging(req.query, 50);
    const where = ['t.user_id = ?'];
    const params = [req.userId];
    if (req.query.projectId) {
      where.push('t.project_id = ?');
      params.push(req.query.projectId);
    }
    const statuses = req.query.status ? String(req.query.status).split(',').filter(Boolean) : [];
    if (statuses.length) {
      where.push(`t.status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
    const priorities = req.query.priority ? String(req.query.priority).split(',').filter(Boolean) : [];
    if (priorities.length) {
      where.push(`t.priority IN (${priorities.map(() => '?').join(',')})`);
      params.push(...priorities);
    }
    if (req.query.q) {
      where.push("(t.title LIKE ? OR t.description LIKE ?)");
      params.push(`%${req.query.q}%`, `%${req.query.q}%`);
    }
    if (req.query.due === 'today') {
      where.push('date(t.due_date) = date(?)');
      params.push(now());
    }
    if (req.query.due === 'overdue') {
      where.push("t.due_date IS NOT NULL AND date(t.due_date) < date(?) AND t.status != 'done'");
      params.push(now());
    }
    if (req.query.due === 'week') {
      where.push("t.due_date IS NOT NULL AND date(t.due_date) BETWEEN date(?) AND date(?, '+7 day')");
      params.push(now(), now());
    }
    const sorts = {
      due_date: 't.due_date',
      priority:
        "CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END",
      created_at: 't.created_at',
      updated_at: 't.updated_at',
      title: 't.title',
    };
    const sortCol = sorts[req.query.sort] || 't.position';
    const dir = String(req.query.dir || '').toLowerCase() === 'asc' ? 'ASC' : req.query.sort ? 'DESC' : 'ASC';
    const whereSql = where.join(' AND ');
    const total = get(`SELECT COUNT(*) AS c FROM tasks t WHERE ${whereSql}`, ...params).c;
    const rows = all(
      `SELECT t.* FROM tasks t WHERE ${whereSql} ORDER BY ${sortCol} ${dir}, t.created_at DESC LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      offset
    );
    res.json({ data: decorate(req.userId, rows), meta: paginationMeta(total, { page, pageSize }) });
  })
);

tasksRouter.get(
  '/stats',
  ah(async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const row = get(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked,
        SUM(CASE WHEN due_date IS NOT NULL AND date(due_date) = ? AND status != 'done' THEN 1 ELSE 0 END) AS due_today,
        SUM(CASE WHEN due_date IS NOT NULL AND date(due_date) < ? AND status != 'done' THEN 1 ELSE 0 END) AS overdue
       FROM tasks WHERE user_id = ?`,
      today,
      today,
      req.userId
    );
    res.json({ data: row });
  })
);

tasksRouter.post(
  '/',
  ah(async (req, res) => {
    const body = validate(taskBody, req.body);
    assertProject(req.userId, body.projectId);
    const id = newId();
    const ts = now();
    const position = get('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM tasks WHERE user_id = ?', req.userId).p;
    run(
      `INSERT INTO tasks (id, user_id, project_id, title, description, priority, status, due_date, completed_at, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      req.userId,
      body.projectId || null,
      body.title,
      body.description,
      body.priority,
      body.status,
      body.dueDate || null,
      body.status === 'done' ? ts : null,
      position,
      ts,
      ts
    );
    const task = mapTask(get('SELECT * FROM tasks WHERE id = ?', id));
    syncSearch(task);
    recordActivity(req.userId, {
      type: 'task',
      projectId: task.projectId,
      title: `Created task “${task.title}”`,
      description: `Priority ${task.priority}`,
    });
    res.status(201).json({ data: task });
  })
);

tasksRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const existing = get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!existing) throw notFound('Task not found');
    const body = validate(taskBody.partial().extend({ position: z.number().int().optional() }), req.body);
    if (!Object.keys(body).length) throw badRequest('Nothing to update');
    if (body.projectId !== undefined) assertProject(req.userId, body.projectId);
    const ts = now();
    const completedAt =
      body.status === undefined
        ? undefined
        : body.status === 'done'
          ? existing.completed_at || ts
          : null;
    const columns = {
      title: body.title,
      description: body.description,
      priority: body.priority,
      status: body.status,
      due_date: body.dueDate === undefined ? undefined : body.dueDate || null,
      project_id: body.projectId === undefined ? undefined : body.projectId || null,
      completed_at: completedAt,
      position: body.position,
      updated_at: ts,
    };
    const keys = Object.keys(columns).filter((k) => columns[k] !== undefined);
    run(
      `UPDATE tasks SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND user_id = ?`,
      ...keys.map((k) => columns[k]),
      req.params.id,
      req.userId
    );
    const task = mapTask(get('SELECT * FROM tasks WHERE id = ?', req.params.id));
    syncSearch(task);
    if (body.status && body.status !== existing.status && body.status === 'done') {
      recordActivity(req.userId, {
        type: 'task',
        projectId: task.projectId,
        title: `Completed task “${task.title}”`,
      });
    }
    res.json({ data: task });
  })
);

// Bulk status changes for multi-select actions in the UI.
tasksRouter.post(
  '/bulk',
  ah(async (req, res) => {
    const body = validate(
      z.object({
        ids: z.array(z.string()).min(1).max(200),
        status: z.enum(['todo', 'in_progress', 'blocked', 'done']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        delete: z.boolean().optional(),
      }),
      req.body
    );
    const placeholders = body.ids.map(() => '?').join(',');
    const owned = all(
      `SELECT * FROM tasks WHERE id IN (${placeholders}) AND user_id = ?`,
      ...body.ids,
      req.userId
    );
    if (!owned.length) throw notFound('No matching tasks');
    const ts = now();
    if (body.delete) {
      run(
        `DELETE FROM tasks WHERE id IN (${placeholders}) AND user_id = ?`,
        ...body.ids,
        req.userId
      );
      for (const t of owned) deleteEntity('task', t.id);
      recordActivity(req.userId, {
        type: 'task',
        title: `Deleted ${owned.length} task${owned.length === 1 ? '' : 's'}`,
      });
      return res.json({ data: { updated: 0, deleted: owned.length } });
    }
    const sets = [];
    const params = [];
    if (body.status) {
      sets.push('status = ?');
      params.push(body.status);
      sets.push('completed_at = ?');
      params.push(body.status === 'done' ? ts : null);
    }
    if (body.priority) {
      sets.push('priority = ?');
      params.push(body.priority);
    }
    if (!sets.length) throw badRequest('No changes requested');
    run(
      `UPDATE tasks SET ${sets.join(', ')}, updated_at = ? WHERE id IN (${placeholders}) AND user_id = ?`,
      ...params,
      ts,
      ...body.ids,
      req.userId
    );
    const updated = all(
      `SELECT * FROM tasks WHERE id IN (${placeholders}) AND user_id = ?`,
      ...body.ids,
      req.userId
    ).map(mapTask);
    updated.forEach(syncSearch);
    recordActivity(req.userId, {
      type: 'task',
      title: `Updated ${updated.length} task${updated.length === 1 ? '' : 's'}`,
      description: body.status ? `Moved to ${body.status.replace('_', ' ')}` : undefined,
    });
    return res.json({ data: updated });
  })
);

tasksRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const existing = get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!existing) throw notFound('Task not found');
    run('DELETE FROM tasks WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    deleteEntity('task', req.params.id);
    res.json({ ok: true, id: req.params.id });
  })
);
