import { Router } from 'express';
import { z } from 'zod';
import { all, get, run } from '../db/index.js';
import { validate } from '../lib/validate.js';
import { ah, notFound, newId, now, readPaging, paginationMeta } from '../lib/http.js';
import { mapNote } from '../lib/mappers.js';
import { recordActivity } from '../lib/activity.js';
import { indexEntity, deleteEntity } from '../db/search.js';

export const notesRouter = Router();

const noteBody = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  body: z.string().max(50000).default(''),
  tags: z.array(z.string().trim().min(1).max(30)).max(15).default([]),
  kind: z.enum(['note', 'decision', 'debug', 'snippet', 'doc']).default('note'),
  pinned: z.boolean().default(false),
  projectId: z.string().nullish(),
});

function syncSearch(note) {
  indexEntity('note', {
    id: note.id,
    user_id: note.userId,
    project_id: note.projectId,
    title: note.title,
    body: `${note.body}\n${note.tags.join(' ')}`,
    updated_at: note.updatedAt,
  });
}

function snapshot(noteRow) {
  run(
    'INSERT INTO note_revisions (id, note_id, title, body, created_at) VALUES (?, ?, ?, ?, ?)',
    newId(),
    noteRow.id,
    noteRow.title,
    noteRow.body,
    now()
  );
  // Keep the last 20 revisions per note.
  const extra = all(
    'SELECT id FROM note_revisions WHERE note_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET 20',
    noteRow.id
  );
  for (const row of extra) run('DELETE FROM note_revisions WHERE id = ?', row.id);
}

notesRouter.get(
  '/',
  ah(async (req, res) => {
    const { page, pageSize, offset } = readPaging(req.query, 30);
    const where = ['user_id = ?'];
    const params = [req.userId];
    if (req.query.projectId) {
      where.push('project_id = ?');
      params.push(req.query.projectId);
    }
    if (req.query.kind && req.query.kind !== 'all') {
      where.push('kind = ?');
      params.push(req.query.kind);
    }
    if (req.query.pinned === 'true') where.push('pinned = 1');
    if (req.query.tag) {
      where.push('tags LIKE ?');
      params.push(`%"${req.query.tag}"%`);
    }
    if (req.query.q) {
      where.push('(title LIKE ? OR body LIKE ? OR tags LIKE ?)');
      const like = `%${req.query.q}%`;
      params.push(like, like, like);
    }
    const whereSql = where.join(' AND ');
    const total = get(`SELECT COUNT(*) AS c FROM notes WHERE ${whereSql}`, ...params).c;
    const rows = all(
      `SELECT * FROM notes WHERE ${whereSql} ORDER BY pinned DESC, updated_at DESC LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      offset
    );
    const projects = new Map(
      all('SELECT id, name, color FROM projects WHERE user_id = ?', req.userId).map((p) => [p.id, p])
    );
    res.json({
      data: rows.map((r) => {
        const n = mapNote(r);
        return {
          ...n,
          projectName: projects.get(n.projectId)?.name ?? null,
          projectColor: projects.get(n.projectId)?.color ?? null,
        };
      }),
      meta: paginationMeta(total, { page, pageSize }),
    });
  })
);

notesRouter.get(
  '/tags',
  ah(async (req, res) => {
    const rows = all('SELECT tags FROM notes WHERE user_id = ?', req.userId);
    const counts = new Map();
    for (const row of rows) {
      for (const tag of JSON.parse(row.tags || '[]')) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    res.json({
      data: [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count),
    });
  })
);

notesRouter.get(
  '/:id',
  ah(async (req, res) => {
    const row = get('SELECT * FROM notes WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!row) throw notFound('Note not found');
    res.json({
      data: {
        ...mapNote(row),
        revisions: all(
          'SELECT id, title, body, created_at FROM note_revisions WHERE note_id = ? ORDER BY created_at DESC LIMIT 20',
          row.id
        ).map((r) => ({ id: r.id, title: r.title, body: r.body, createdAt: r.created_at })),
      },
    });
  })
);

notesRouter.post(
  '/',
  ah(async (req, res) => {
    const body = validate(noteBody, req.body);
    const id = newId();
    const ts = now();
    run(
      `INSERT INTO notes (id, user_id, project_id, title, body, tags, kind, pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      req.userId,
      body.projectId || null,
      body.title,
      body.body,
      JSON.stringify(body.tags),
      body.kind,
      body.pinned ? 1 : 0,
      ts,
      ts
    );
    const note = mapNote(get('SELECT * FROM notes WHERE id = ?', id));
    syncSearch(note);
    recordActivity(req.userId, {
      type: 'note',
      projectId: note.projectId,
      title: `Added ${note.kind === 'note' ? 'note' : note.kind}: ${note.title}`,
      description: note.body.slice(0, 160),
    });
    res.status(201).json({ data: note });
  })
);

notesRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const existing = get('SELECT * FROM notes WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!existing) throw notFound('Note not found');
    const body = validate(noteBody.partial(), req.body);
    if (body.body !== undefined && body.body !== existing.body) snapshot(existing);
    const columns = {
      title: body.title,
      body: body.body,
      tags: body.tags ? JSON.stringify(body.tags) : undefined,
      kind: body.kind,
      pinned: body.pinned === undefined ? undefined : body.pinned ? 1 : 0,
      project_id: body.projectId === undefined ? undefined : body.projectId || null,
    };
    const keys = Object.keys(columns).filter((k) => columns[k] !== undefined);
    run(
      `UPDATE notes SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND user_id = ?`,
      ...keys.map((k) => columns[k]),
      now(),
      req.params.id,
      req.userId
    );
    const note = mapNote(get('SELECT * FROM notes WHERE id = ?', req.params.id));
    syncSearch(note);
    res.json({ data: note });
  })
);

notesRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const existing = get('SELECT * FROM notes WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!existing) throw notFound('Note not found');
    run('DELETE FROM notes WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    deleteEntity('note', req.params.id);
    res.json({ ok: true, id: req.params.id });
  })
);
