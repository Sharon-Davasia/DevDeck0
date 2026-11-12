import { newId, now } from './http.js';
import { run, all, get } from '../db/index.js';
import { indexEntity } from '../db/search.js';
import { broadcast } from './realtime.js';

export const ACTIVITY_TYPES = [
  'commit',
  'command',
  'task',
  'service',
  'note',
  'project',
  'github',
  'auth',
  'system',
];

/**
 * Append an entry to the user's daily activity timeline and push it to
 * connected clients so dashboards update live.
 */
export function recordActivity(userId, entry) {
  const row = {
    id: newId(),
    user_id: userId,
    project_id: entry.projectId ?? entry.project_id ?? null,
    type: entry.type,
    title: entry.title,
    description: entry.description ?? '',
    meta: entry.meta ? JSON.stringify(entry.meta) : '{}',
    created_at: entry.createdAt || now(),
  };
  run(
    `INSERT INTO activity (id, user_id, project_id, type, title, description, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id,
    row.user_id,
    row.project_id,
    row.type,
    row.title,
    row.description,
    row.meta,
    row.created_at
  );
  indexEntity('activity', {
    id: row.id,
    user_id: row.user_id,
    project_id: row.project_id,
    title: row.title,
    body: row.description,
    updated_at: row.created_at,
  });
  const { meta, ...rest } = row;
  const payload = { ...rest, projectId: rest.project_id, meta: JSON.parse(meta) };
  delete payload.project_id;
  delete payload.user_id;
  broadcast(userId, 'activity:new', payload);
  return payload;
}

export function listActivity(userId, { limit = 50, projectId, type, from, to, offset = 0 } = {}) {
  const where = ['user_id = ?'];
  const params = [userId];
  if (projectId) {
    where.push('project_id = ?');
    params.push(projectId);
  }
  if (type && type !== 'all') {
    where.push('type = ?');
    params.push(type);
  }
  if (from) {
    where.push('created_at >= ?');
    params.push(from);
  }
  if (to) {
    where.push('created_at <= ?');
    params.push(to);
  }
  const rows = all(
    `SELECT * FROM activity WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset
  );
  const total = get(
    `SELECT COUNT(*) AS c FROM activity WHERE ${where.join(' AND ')}`,
    ...params
  ).c;
  return {
    data: rows.map((r) => ({ ...r, projectId: r.project_id, meta: JSON.parse(r.meta || '{}') })),
    total,
  };
}

/** Group activity rows by calendar day for the timeline view. */
export function groupByDay(rows) {
  const groups = new Map();
  for (const row of rows) {
    const day = row.created_at.slice(0, 10);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(row);
  }
  return [...groups.entries()].map(([date, items]) => ({ date, items }));
}
