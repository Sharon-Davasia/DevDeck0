import { Router } from 'express';
import { z } from 'zod';
import { all, get, run } from '../db/index.js';
import { validate } from '../lib/validate.js';
import { ah, notFound, newId, now, badRequest } from '../lib/http.js';
import { mapProject, mapTask, mapNote, mapCommand, mapService } from '../lib/mappers.js';
import { recordActivity } from '../lib/activity.js';
import { indexEntity, deleteEntity } from '../db/search.js';

export const projectsRouter = Router();

const projectBody = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(100),
  description: z.string().max(4000).default(''),
  techStack: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  repoUrl: z.string().trim().url().or(z.literal('')).nullish(),
  localPath: z.string().trim().max(400).nullish(),
  environment: z.enum(['local', 'staging', 'production', 'sandbox']).default('local'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
  status: z.enum(['active', 'archived']).default('active'),
});

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

function syncSearch(userId, project) {
  indexEntity('project', {
    id: project.id,
    user_id: userId,
    project_id: project.id,
    title: project.name,
    body: [project.description, project.techStack.join(' '), project.localPath, project.repoUrl]
      .filter(Boolean)
      .join('\n'),
    updated_at: project.updatedAt,
  });
}

projectsRouter.get(
  '/',
  ah(async (req, res) => {
    const { status = 'active', q = '' } = req.query;
    const where = ['user_id = ?'];
    const params = [req.userId];
    if (status !== 'all') {
      where.push('status = ?');
      params.push(status);
    }
    if (q) {
      where.push("(name LIKE ? OR description LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }
    const rows = all(
      `SELECT * FROM projects WHERE ${where.join(' AND ')} ORDER BY
         CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at DESC`,
      ...params
    );
    const projects = rows.map((r) => {
      const counts = get(
        `SELECT
           (SELECT COUNT(*) FROM tasks WHERE project_id = ? AND status != 'done') AS open_tasks,
           (SELECT COUNT(*) FROM tasks WHERE project_id = ? AND status = 'done') AS done_tasks,
           (SELECT COUNT(*) FROM notes WHERE project_id = ?) AS notes,
           (SELECT COUNT(*) FROM commands WHERE project_id = ?) AS commands,
           (SELECT COUNT(*) FROM services WHERE project_id = ? AND status = 'running') AS services`,
        r.id,
        r.id,
        r.id,
        r.id,
        r.id
      );
      return {
        ...mapProject(r),
        counts: {
          openTasks: counts.open_tasks,
          doneTasks: counts.done_tasks,
          notes: counts.notes,
          commands: counts.commands,
          runningServices: counts.services,
        },
      };
    });
    res.json({ data: projects });
  })
);

projectsRouter.post(
  '/',
  ah(async (req, res) => {
    const body = validate(projectBody, req.body);
    const id = newId();
    const ts = now();
    run(
      `INSERT INTO projects (id, user_id, name, slug, description, tech_stack, repo_url, local_path, environment, status, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      req.userId,
      body.name,
      slugify(body.name),
      body.description,
      JSON.stringify(body.techStack),
      body.repoUrl || null,
      body.localPath || null,
      body.environment,
      body.status,
      body.color,
      ts,
      ts
    );
    const project = mapProject(get('SELECT * FROM projects WHERE id = ?', id));
    syncSearch(req.userId, project);
    recordActivity(req.userId, {
      type: 'project',
      projectId: id,
      title: `Created project ${project.name}`,
      description: project.description,
    });
    res.status(201).json({ data: project });
  })
);

projectsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const row = get('SELECT * FROM projects WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!row) throw notFound('Project not found');
    const project = mapProject(row);
    res.json({
      data: {
        ...project,
        tasks: all(
          "SELECT * FROM tasks WHERE project_id = ? AND user_id = ? ORDER BY CASE status WHEN 'done' THEN 1 ELSE 0 END, updated_at DESC LIMIT 50",
          row.id,
          req.userId
        ).map(mapTask),
        notes: all(
          'SELECT * FROM notes WHERE project_id = ? AND user_id = ? ORDER BY pinned DESC, updated_at DESC LIMIT 20',
          row.id,
          req.userId
        ).map(mapNote),
        commands: all(
          'SELECT * FROM commands WHERE project_id = ? AND user_id = ? ORDER BY updated_at DESC LIMIT 20',
          row.id,
          req.userId
        ).map(mapCommand),
        services: all(
          'SELECT * FROM services WHERE project_id = ? AND user_id = ? ORDER BY name',
          row.id,
          req.userId
        ).map(mapService),
        activity: all(
          'SELECT * FROM activity WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 25',
          row.id,
          req.userId
        ).map((r) => ({ ...r, projectId: r.project_id, meta: JSON.parse(r.meta || '{}') })),
      },
    });
  })
);

projectsRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const existing = get('SELECT * FROM projects WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!existing) throw notFound('Project not found');
    const body = validate(projectBody.partial(), req.body);
    if (!Object.keys(body).length) throw badRequest('Nothing to update');
    const columns = {
      name: body.name,
      slug: body.name ? slugify(body.name) : undefined,
      description: body.description,
      tech_stack: body.techStack ? JSON.stringify(body.techStack) : undefined,
      repo_url: body.repoUrl === undefined ? undefined : body.repoUrl || null,
      local_path: body.localPath === undefined ? undefined : body.localPath || null,
      environment: body.environment,
      color: body.color,
      status: body.status,
    };
    const keys = Object.keys(columns).filter((k) => columns[k] !== undefined);
    run(
      `UPDATE projects SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND user_id = ?`,
      ...keys.map((k) => columns[k]),
      now(),
      req.params.id,
      req.userId
    );
    const project = mapProject(get('SELECT * FROM projects WHERE id = ?', req.params.id));
    syncSearch(req.userId, project);
    if (body.status === 'archived' && existing.status !== 'archived') {
      recordActivity(req.userId, {
        type: 'project',
        projectId: project.id,
        title: `Archived project ${project.name}`,
      });
    }
    res.json({ data: project });
  })
);

projectsRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const existing = get('SELECT * FROM projects WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!existing) throw notFound('Project not found');
    run('DELETE FROM projects WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    deleteEntity('project', req.params.id);
    recordActivity(req.userId, {
      type: 'project',
      title: `Deleted project ${existing.name}`,
    });
    res.json({ ok: true, id: req.params.id });
  })
);
