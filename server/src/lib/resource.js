/**
 * Generic user-scoped CRUD helpers shared by every resource router.
 * All queries include `user_id = ?` — the isolation boundary for the app.
 */
import { all, get, run, like } from '../db/index.js';
import { newId, now, notFound, readPaging, paginated } from './http.js';
import { indexEntity, deleteEntity } from '../db/search.js';
import { recordActivity } from './activity.js';

export function ownedRow(table, id, userId) {
  const row = get(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`, id, userId);
  if (!row) throw notFound();
  return row;
}

/**
 * Build a list handler supporting search, project filter, custom filters,
 * sorting and pagination.
 */
export function makeList({
  table,
  columns,
  map = (r) => r,
  searchable = [],
  sortable = ['created_at'],
  defaultSort = 'created_at',
  defaultDir = 'desc',
  filters = {},
}) {
  return function list(userId, query = {}) {
    const { page, pageSize, offset } = readPaging(query);
    const where = ['user_id = ?'];
    const params = [userId];

    if (query.projectId) {
      where.push('project_id = ?');
      params.push(query.projectId);
    }
    if (query.q && searchable.length) {
      where.push(`(${searchable.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
      for (let i = 0; i < searchable.length; i += 1) params.push(like(query.q));
    }
    for (const [col, spec] of Object.entries(filters)) {
      const value = query[spec.param || col];
      if (value === undefined || value === '' || value === null) continue;
      if (spec.type === 'boolean') {
        where.push(`${col} = ?`);
        params.push(['1', 'true', true, 'yes'].includes(value) ? 1 : 0);
      } else if (Array.isArray(value)) {
        if (!value.length) continue;
        where.push(`${col} IN (${value.map(() => '?').join(',')})`);
        params.push(...value);
      } else {
        where.push(`${col} = ?`);
        params.push(value);
      }
    }
    if (query.from) {
      where.push('created_at >= ?');
      params.push(query.from);
    }
    if (query.to) {
      where.push('created_at <= ?');
      params.push(query.to);
    }

    const sortCol = sortable.includes(query.sort) ? query.sort : defaultSort;
    const dir = String(query.dir || defaultDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const whereSql = where.join(' AND ');

    const total = get(`SELECT COUNT(*) AS c FROM ${table} WHERE ${whereSql}`, ...params).c;
    const rows = all(
      `SELECT ${columns} FROM ${table} WHERE ${whereSql} ORDER BY ${sortCol} ${dir} LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      offset
    );
    return paginated(rows.map(map), total, { page, pageSize });
  };
}

export function makeCreate({ table, columns, map = (r) => r, activity, search }) {
  return function create(userId, payload) {
    const id = payload.id || newId();
    const ts = now();
    const values = { ...payload, id, user_id: userId, created_at: ts, updated_at: ts };
    const keys = Object.keys(values).filter((k) => columns.includes(k));
    run(
      `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
      ...keys.map((k) => values[k])
    );
    const row = get(`SELECT * FROM ${table} WHERE id = ?`, id);
    const mapped = map(row);
    if (search) indexEntity(search.entity, search.map(mapped, row));
    if (activity) recordActivity(userId, activity(mapped, row));
    return mapped;
  };
}

export function makeUpdate({ table, columns, map = (r) => r, search, activity }) {
  return function update(userId, id, patch) {
    const existing = ownedRow(table, id, userId);
    const keys = Object.keys(patch).filter(
      (k) => columns.includes(k) && k !== 'id' && k !== 'user_id' && k !== 'created_at'
    );
    if (!keys.length) return map(existing);
    keys.push('updated_at');
    const values = { ...patch, updated_at: now() };
    run(
      `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND user_id = ?`,
      ...keys.map((k) => values[k]),
      id,
      userId
    );
    const row = get(`SELECT * FROM ${table} WHERE id = ?`, id);
    const mapped = map(row);
    if (search) indexEntity(search.entity, search.map(mapped, row));
    if (activity) for (const a of activity(mapped, row, existing)) recordActivity(userId, a);
    return mapped;
  };
}

export function makeRemove({ table, search }) {
  return function remove(userId, id, activity) {
    const existing = ownedRow(table, id, userId);
    run(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`, id, userId);
    if (search) deleteEntity(search.entity, id);
    if (activity) recordActivity(userId, activity(existing));
    return existing;
  };
}
