import { Router } from 'express';
import { ah, } from '../lib/http.js';
import { search, recentSearches } from '../db/search.js';
import { all } from '../db/index.js';

export const searchRouter = Router();

searchRouter.get(
  '/',
  ah(async (req, res) => {
    const { q, projectId, types } = req.query;
    const typeList = types ? String(types).split(',').filter(Boolean) : undefined;
    const results = search(req.userId, {
      q,
      projectId: projectId || undefined,
      types: typeList,
      limit: Math.min(60, Number(req.query.limit) || 40),
    });
    const projects = new Map(
      all('SELECT id, name, color FROM projects WHERE user_id = ?', req.userId).map((p) => [p.id, p])
    );
    const grouped = {};
    for (const r of results) {
      grouped[r.entity] ||= [];
      grouped[r.entity].push({
        ...r,
        projectName: projects.get(r.projectId)?.name ?? null,
        projectColor: projects.get(r.projectId)?.color ?? null,
      });
    }
    res.json({
      data: { results, grouped, total: results.length },
      meta: { query: q || '', order: ['project', 'task', 'note', 'command', 'run', 'service', 'repo', 'activity'] },
    });
  })
);

searchRouter.get(
  '/recent',
  ah(async (req, res) => {
    res.json({ data: recentSearches(req.userId) });
  })
);
