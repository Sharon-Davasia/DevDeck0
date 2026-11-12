import { all, get, run, like } from '../db/index.js';

const ENTITIES = ['project', 'task', 'note', 'command', 'run', 'service', 'repo', 'activity'];

/** Upsert a row into the FTS mirror tables. */
export function indexEntity(entity, row) {
  if (!ENTITIES.includes(entity)) return;
  const ids = {
    entity,
    entity_id: row.id,
    user_id: row.user_id,
    project_id: row.project_id ?? null,
    title: row.title ?? '',
    body: row.body ?? '',
    updated_at: row.updated_at ?? new Date().toISOString(),
  };
  run(
    `INSERT INTO search_index (entity, entity_id, user_id, project_id, title, body, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(entity, entity_id) DO UPDATE SET
       project_id = excluded.project_id,
       title = excluded.title,
       body = excluded.body,
       updated_at = excluded.updated_at`,
    ids.entity,
    ids.entity_id,
    ids.user_id,
    ids.project_id,
    ids.title,
    ids.body,
    ids.updated_at
  );
  run('DELETE FROM search_fts WHERE entity = ? AND entity_id = ?', entity, row.id);
  run(
    'INSERT INTO search_fts (title, body, entity, entity_id, user_id, project_id) VALUES (?, ?, ?, ?, ?, ?)',
    ids.title,
    ids.body,
    entity,
    ids.entity_id,
    ids.user_id,
    ids.project_id
  );
}

export function deleteEntity(entity, id) {
  run('DELETE FROM search_index WHERE entity = ? AND entity_id = ?', entity, id);
  run('DELETE FROM search_fts WHERE entity = ? AND entity_id = ?', entity, id);
}

function escapeFts(term) {
  return term
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '""')}"*`)
    .join(' ');
}

/**
 * Full-text search across every indexed entity for a user.
 * Falls back to LIKE matching when the FTS expression is unusable.
 */
export function search(userId, { q, projectId, types, limit = 40 }) {
  const term = String(q || '').trim();
  if (!term) return [];
  const allowed = types?.length ? types.filter((t) => ENTITIES.includes(t)) : ENTITIES;
  const placeholders = allowed.map(() => '?').join(',');
  let rows = [];
  try {
    rows = all(
      `SELECT s.entity, s.entity_id, s.title, s.body, s.project_id, s.updated_at
       FROM search_fts f
       JOIN search_index s ON s.entity = f.entity AND s.entity_id = f.entity_id
       WHERE search_fts MATCH ? AND s.user_id = ?
         AND s.entity IN (${placeholders})
         ${projectId ? 'AND (s.project_id = ? OR s.project_id IS NULL)' : ''}
       ORDER BY rank
       LIMIT ?`,
      escapeFts(term),
      userId,
      ...allowed,
      ...(projectId ? [projectId] : []),
      limit
    );
  } catch {
    rows = [];
  }
  if (!rows.length) {
    rows = all(
      `SELECT entity, entity_id, title, body, project_id, updated_at
       FROM search_index
       WHERE user_id = ? AND entity IN (${placeholders})
         AND (title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')
         ${projectId ? 'AND (project_id = ? OR project_id IS NULL)' : ''}
       ORDER BY updated_at DESC
       LIMIT ?`,
      userId,
      ...allowed,
      like(term),
      like(term),
      ...(projectId ? [projectId] : []),
      limit
    );
  }

  const needle = term.toLowerCase();
  return rows.map((r) => ({
    id: r.entity_id,
    entity: r.entity,
    title: r.title,
    projectId: r.project_id,
    updatedAt: r.updated_at,
    snippet: snippet(r.body, needle),
  }));
}

export function snippet(body = '', needle = '', radius = 70) {
  const idx = body.toLowerCase().indexOf(needle);
  if (idx === -1) return body.slice(0, radius * 2) + (body.length > radius * 2 ? '…' : '');
  const start = Math.max(0, idx - radius);
  const end = Math.min(body.length, idx + needle.length + radius);
  return `${start > 0 ? '…' : ''}${body.slice(start, end).trim()}${end < body.length ? '…' : ''}`;
}

export function recentSearches(userId, limit = 6) {
  return all(
    `SELECT title, entity, entity_id FROM search_index
     WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?`,
    userId,
    limit
  );
}

export function reindexAll(userId) {
  const rows = all('SELECT entity, entity_id, user_id, project_id, title, body, updated_at FROM search_index WHERE user_id = ?', userId);
  run('DELETE FROM search_fts WHERE user_id = ?', userId);
  for (const row of rows) {
    run(
      'INSERT INTO search_fts (title, body, entity, entity_id, user_id, project_id) VALUES (?, ?, ?, ?, ?, ?)',
      row.title,
      row.body,
      row.entity,
      row.entity_id,
      row.user_id,
      row.project_id
    );
  }
  return get('SELECT COUNT(*) AS c FROM search_index WHERE user_id = ?', userId)?.c ?? 0;
}
