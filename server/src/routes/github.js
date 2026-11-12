import { Router } from 'express';
import { z } from 'zod';
import { get, run, all } from '../db/index.js';
import { validate } from '../lib/validate.js';
import { ah, notFound, newId, now } from '../lib/http.js';
import { mapRepo } from '../lib/mappers.js';
import { recordActivity } from '../lib/activity.js';
import {
  saveIntegration,
  getIntegration,
  publicIntegration,
  verifyToken,
  syncRepo,
  listRemoteRepos,
  listLinkedRepos,
  getToken,
} from '../lib/github.js';
import { config } from '../config.js';

export const githubRouter = Router();

githubRouter.get(
  '/integration',
  ah(async (req, res) => {
    res.json({
      data: publicIntegration(getIntegration(req.userId)),
      meta: { oauthConfigured: Boolean(config.github.oauthClientId) },
    });
  })
);

githubRouter.post(
  '/integration',
  ah(async (req, res) => {
    const body = validate(
      z.object({ token: z.string().trim().min(8).max(400), account: z.string().max(80).optional() }),
      req.body
    );
    const check = await verifyToken(body.token);
    if (!check.ok) {
      return res.status(400).json({ error: `GitHub rejected that token (${check.error})` });
    }
    const row = saveIntegration(req.userId, {
      account: check.login || body.account,
      token: body.token,
      status: 'connected',
      configJson: { avatarUrl: check.avatarUrl, name: check.name },
    });
    recordActivity(req.userId, {
      type: 'github',
      title: `Connected GitHub as @${check.login}`,
    });
    return res.json({ data: publicIntegration(row) });
  })
);

githubRouter.delete(
  '/integration',
  ah(async (req, res) => {
    run(
      "UPDATE integrations SET status = 'disconnected', secret = NULL, updated_at = ? WHERE user_id = ? AND provider = 'github'",
      now(),
      req.userId
    );
    recordActivity(req.userId, { type: 'github', title: 'Disconnected GitHub' });
    res.json({ ok: true });
  })
);

githubRouter.get(
  '/remote',
  ah(async (req, res) => {
    try {
      const repos = await listRemoteRepos(req.userId);
      if (!repos) {
        return res.json({
          data: [],
          meta: { live: false, message: 'Connect a GitHub token to browse your repositories.' },
        });
      }
      return res.json({ data: repos, meta: { live: true } });
    } catch (err) {
      return res.json({ data: [], meta: { live: false, message: err.message } });
    }
  })
);

githubRouter.get(
  '/repos',
  ah(async (req, res) => {
    const rows = listLinkedRepos(req.userId);
    const projects = new Map(
      all('SELECT id, name, color FROM projects WHERE user_id = ?', req.userId).map((p) => [p.id, p])
    );
    res.json({
      data: rows.map((r) => ({
        ...r,
        projectName: projects.get(r.projectId)?.name ?? null,
        projectColor: projects.get(r.projectId)?.color ?? null,
      })),
      meta: { live: Boolean(getToken(req.userId)) },
    });
  })
);

githubRouter.get(
  '/repos/:id',
  ah(async (req, res) => {
    const row = get('SELECT * FROM github_repos WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!row) throw notFound('Repository not found');
    res.json({ data: mapRepo(row), meta: { live: Boolean(getToken(req.userId)) } });
  })
);

githubRouter.post(
  '/repos',
  ah(async (req, res) => {
    const body = validate(
      z.object({
        fullName: z.string().trim().regex(/^[\w.-]+\/[\w.-]+$/, 'Use owner/repo format'),
        projectId: z.string().nullish(),
      }),
      req.body
    );
    // Seed a cached snapshot immediately so the UI never shows an empty card.
    const existing = get(
      'SELECT * FROM github_repos WHERE user_id = ? AND full_name = ?',
      req.userId,
      body.fullName
    );
    let repo;
    try {
      repo = await syncRepo(req.userId, { projectId: body.projectId, fullName: body.fullName });
    } catch (err) {
      if (!existing) {
        const id = newId();
        run(
          `INSERT INTO github_repos (id, user_id, project_id, full_name, description, default_branch, language, stars, open_issues, open_prs, data, synced_at)
           VALUES (?, ?, ?, ?, '', 'main', NULL, 0, 0, 0, '{}', ?)`,
          id,
          req.userId,
          body.projectId || null,
          body.fullName,
          now()
        );
        repo = mapRepo(get('SELECT * FROM github_repos WHERE id = ?', id));
      } else {
        repo = mapRepo(existing);
      }
    }
    if (body.projectId) {
      run(
        'UPDATE projects SET repo_url = ?, updated_at = ? WHERE id = ? AND user_id = ?',
        `https://github.com/${body.fullName}`,
        now(),
        body.projectId,
        req.userId
      );
    }
    recordActivity(req.userId, {
      type: 'github',
      projectId: body.projectId,
      title: `Linked repository ${body.fullName}`,
    });
    res.status(201).json({ data: repo });
  })
);

githubRouter.post(
  '/repos/:id/sync',
  ah(async (req, res) => {
    const row = get('SELECT * FROM github_repos WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!row) throw notFound('Repository not found');
    try {
      const repo = await syncRepo(req.userId, { repoId: row.id, fullName: row.full_name });
      recordActivity(req.userId, {
        type: 'github',
        projectId: row.project_id,
        title: `Synced ${row.full_name}`,
      });
      return res.json({ data: repo, meta: { live: Boolean(getToken(req.userId)) } });
    } catch (err) {
      return res.status(502).json({ error: err.message });
    }
  })
);

githubRouter.delete(
  '/repos/:id',
  ah(async (req, res) => {
    const row = get('SELECT * FROM github_repos WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!row) throw notFound('Repository not found');
    run('DELETE FROM github_repos WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    res.json({ ok: true });
  })
);

// Aggregated feed for the dashboard: recent commits across all linked repos.
githubRouter.get(
  '/activity',
  ah(async (req, res) => {
    const repos = listLinkedRepos(req.userId);
    const commits = repos
      .flatMap((r) =>
        (r.data.commits || []).map((c) => ({ ...c, repo: r.fullName, repoId: r.id, projectId: r.projectId }))
      )
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, Number(req.query.limit) || 12);
    const prs = repos
      .flatMap((r) => (r.data.pullRequests || []).map((p) => ({ ...p, repo: r.fullName })))
      .slice(0, 10);
    const issues = repos
      .flatMap((r) => (r.data.issues || []).map((i) => ({ ...i, repo: r.fullName })))
      .slice(0, 10);
    res.json({ data: { commits, pullRequests: prs, issues } });
  })
);
