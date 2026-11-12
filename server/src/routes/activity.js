import { Router } from 'express';
import { ah } from '../lib/http.js';
import { listActivity, recordActivity, groupByDay } from '../lib/activity.js';
import { all, get } from '../db/index.js';

export const activityRouter = Router();

activityRouter.get(
  '/',
  ah(async (req, res) => {
    const limit = Math.min(200, Number(req.query.limit) || 60);
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const { data, total } = listActivity(req.userId, {
      limit,
      offset,
      projectId: req.query.projectId || undefined,
      type: req.query.type,
      from: req.query.from || undefined,
      to: req.query.to || undefined,
    });
    const projects = new Map(
      all('SELECT id, name, color FROM projects WHERE user_id = ?', req.userId).map((p) => [p.id, p])
    );
    const enriched = data.map((r) => ({
      ...r,
      projectName: projects.get(r.projectId)?.name ?? null,
      projectColor: projects.get(r.projectId)?.color ?? null,
    }));
    res.json({
      data: enriched,
      groups: groupByDay(enriched),
      meta: { total, limit, offset, hasMore: offset + limit < total },
    });
  })
);

activityRouter.get(
  '/summary',
  ah(async (req, res) => {
    const range = Number(req.query.days) || 30;
    const rows = all(
      `SELECT type, COUNT(*) AS c FROM activity
       WHERE user_id = ? AND created_at >= datetime('now', ?) GROUP BY type`,
      req.userId,
      `-${range} days`
    );
    const byType = Object.fromEntries(rows.map((r) => [r.type, r.c]));
    const total = get(
      `SELECT COUNT(*) AS c FROM activity WHERE user_id = ? AND created_at >= datetime('now', ?)`,
      req.userId,
      `-${range} days`
    ).c;
    res.json({ data: { byType, total, days: range } });
  })
);

activityRouter.post(
  '/',
  ah(async (req, res) => {
    const { title, description = '', type = 'system', projectId = null } = req.body || {};
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const entry = recordActivity(req.userId, { type, title, description, projectId });
    return res.status(201).json({ data: entry });
  })
);
