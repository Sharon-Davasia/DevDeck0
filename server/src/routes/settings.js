import { Router } from 'express';
import { z } from 'zod';
import { all, get, run } from '../db/index.js';
import { validate } from '../lib/validate.js';
import { ah, now } from '../lib/http.js';
import { publicUser } from '../lib/auth.js';
import { evaluateCommand } from '../lib/commandPolicy.js';
import { dockerAvailable } from '../lib/docker.js';
import { config } from '../config.js';

export const settingsRouter = Router();

settingsRouter.get(
  '/',
  ah(async (req, res) => {
    const docker = await dockerAvailable({ refresh: true });
    const github = get(
      "SELECT * FROM integrations WHERE user_id = ? AND provider = 'github'",
      req.userId
    );
    res.json({
      data: {
        profile: publicUser(req.user),
        commandPolicy: {
          enabled: config.commandExecution.enabled,
          requireAllowlist: config.commandExecution.requireAllowlist,
          timeoutMs: config.commandExecution.timeoutMs,
          maxOutputBytes: config.commandExecution.maxOutputBytes,
        },
        docker: { host: config.docker.host, enabled: config.docker.enabled, ...docker },
        github: github
          ? { status: github.status, account: github.account, hasToken: Boolean(github.secret) }
          : { status: 'disconnected', account: null, hasToken: false },
        counts: {
          projects: get('SELECT COUNT(*) c FROM projects WHERE user_id = ?', req.userId).c,
          tasks: get('SELECT COUNT(*) c FROM tasks WHERE user_id = ?', req.userId).c,
          notes: get('SELECT COUNT(*) c FROM notes WHERE user_id = ?', req.userId).c,
          commands: get('SELECT COUNT(*) c FROM command_runs WHERE user_id = ?', req.userId).c,
        },
      },
    });
  })
);

// Persist behavioural preferences (command execution confirmations, editor, etc.)
settingsRouter.patch(
  '/prefs',
  ah(async (req, res) => {
    const body = validate(z.object({ prefs: z.record(z.string(), z.any()) }), req.body);
    const existing = JSON.parse(req.user.prefs || '{}');
    run(
      'UPDATE users SET prefs = ?, updated_at = ? WHERE id = ?',
      JSON.stringify({ ...existing, ...body.prefs }),
      now(),
      req.userId
    );
    res.json({ data: publicUser(get('SELECT * FROM users WHERE id = ?', req.userId)) });
  })
);

settingsRouter.post(
  '/policy/check',
  ah(async (req, res) => {
    const { command } = validate(z.object({ command: z.string().max(2000) }), req.body);
    res.json({ data: evaluateCommand(command) });
  })
);

// Full JSON export of everything the user owns.
settingsRouter.get(
  '/export',
  ah(async (req, res) => {
    const uid = req.userId;
    const payload = {
      exportedAt: now(),
      version: 1,
      user: publicUser(req.user),
      projects: all('SELECT * FROM projects WHERE user_id = ?', uid),
      tasks: all('SELECT * FROM tasks WHERE user_id = ?', uid),
      notes: all('SELECT * FROM notes WHERE user_id = ?', uid),
      noteRevisions: all(
        'SELECT r.* FROM note_revisions r JOIN notes n ON n.id = r.note_id WHERE n.user_id = ?',
        uid
      ),
      commands: all('SELECT * FROM commands WHERE user_id = ?', uid),
      commandRuns: all('SELECT * FROM command_runs WHERE user_id = ?', uid),
      services: all('SELECT * FROM services WHERE user_id = ?', uid),
      activity: all('SELECT * FROM activity WHERE user_id = ?', uid),
      repositories: all('SELECT * FROM github_repos WHERE user_id = ?', uid),
    };
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="devdeck-export-${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.json(payload);
  })
);

// Import a previously exported workspace (merge semantics, new ids).
settingsRouter.post(
  '/import',
  ah(async (req, res) => {
    const body = validate(
      z.object({
        projects: z.array(z.record(z.string(), z.any())).optional(),
        tasks: z.array(z.record(z.string(), z.any())).optional(),
        notes: z.array(z.record(z.string(), z.any())).optional(),
        commands: z.array(z.record(z.string(), z.any())).optional(),
        services: z.array(z.record(z.string(), z.any())).optional(),
      }),
      req.body
    );
    const summary = { projects: 0, tasks: 0, notes: 0, commands: 0, services: 0 };
    const idMap = new Map();
    const ts = now();
    const { randomUUID } = await import('node:crypto');
    for (const p of body.projects || []) {
      const id = randomUUID();
      idMap.set(p.id, id);
      run(
        `INSERT INTO projects (id, user_id, name, slug, description, tech_stack, repo_url, local_path, environment, status, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        req.userId,
        p.name || 'Imported project',
        (p.name || 'imported').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        p.description || '',
        p.tech_stack || '[]',
        p.repo_url || null,
        p.local_path || null,
        p.environment || 'local',
        p.status || 'active',
        p.color || '#6366f1',
        ts,
        ts
      );
      summary.projects += 1;
    }
    for (const t of body.tasks || []) {
      run(
        `INSERT INTO tasks (id, user_id, project_id, title, description, priority, status, due_date, completed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        req.userId,
        idMap.get(t.project_id) || null,
        t.title || 'Imported task',
        t.description || '',
        t.priority || 'medium',
        t.status || 'todo',
        t.due_date || null,
        t.completed_at || null,
        ts,
        ts
      );
      summary.tasks += 1;
    }
    for (const n of body.notes || []) {
      run(
        `INSERT INTO notes (id, user_id, project_id, title, body, tags, kind, pinned, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        req.userId,
        idMap.get(n.project_id) || null,
        n.title || 'Imported note',
        n.body || '',
        n.tags || '[]',
        n.kind || 'note',
        n.pinned || 0,
        ts,
        ts
      );
      summary.notes += 1;
    }
    for (const c of body.commands || []) {
      run(
        `INSERT INTO commands (id, user_id, project_id, name, description, command, cwd, tags, approved, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        req.userId,
        idMap.get(c.project_id) || null,
        c.name || 'Imported command',
        c.description || '',
        c.command || 'echo hello',
        c.cwd || null,
        c.tags || '[]',
        c.approved ? 1 : 0,
        ts,
        ts
      );
      summary.commands += 1;
    }
    for (const s of body.services || []) {
      run(
        `INSERT INTO services (id, user_id, project_id, name, kind, container_id, image, ports, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        req.userId,
        idMap.get(s.project_id) || null,
        s.name || 'Imported service',
        s.kind || 'docker',
        s.container_id || null,
        s.image || null,
        s.ports || '[]',
        'stopped',
        ts,
        ts
      );
      summary.services += 1;
    }
    res.json({ data: summary });
  })
);

// Wipe all workspace content but keep the account.
settingsRouter.post(
  '/reset',
  ah(async (req, res) => {
    const uid = req.userId;
    for (const table of ['tasks', 'notes', 'commands', 'services', 'activity', 'github_repos']) {
      run(`DELETE FROM ${table} WHERE user_id = ?`, uid);
    }
    run('DELETE FROM command_runs WHERE user_id = ?', uid);
    run('DELETE FROM projects WHERE user_id = ?', uid);
    run('DELETE FROM search_index WHERE user_id = ?', uid);
    run('DELETE FROM search_fts WHERE user_id = ?', uid);
    res.json({ ok: true });
  })
);
