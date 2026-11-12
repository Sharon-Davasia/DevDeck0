import { parseJson } from './http.js';

const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

/** Convert a snake_case DB row into a camelCase API object. */
export function camelize(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[camel(k)] = v;
  return out;
}

export const mapProject = (r) => {
  const p = camelize(r);
  return {
    ...p,
    techStack: parseJson(r.tech_stack, []),
    repoUrl: r.repo_url,
    localPath: r.local_path,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
};

export const mapTask = (r) => ({
  ...camelize(r),
  projectId: r.project_id,
  dueDate: r.due_date,
  completedAt: r.completed_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const mapCommand = (r) => ({
  ...camelize(r),
  projectId: r.project_id,
  tags: parseJson(r.tags, []),
  approved: Boolean(r.approved),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const mapRun = (r) => ({
  ...camelize(r),
  projectId: r.project_id,
  commandId: r.command_id,
  exitCode: r.exit_code,
  durationMs: r.duration_ms,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
});

export const mapNote = (r) => ({
  ...camelize(r),
  projectId: r.project_id,
  tags: parseJson(r.tags, []),
  pinned: Boolean(r.pinned),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const mapService = (r) => ({
  ...camelize(r),
  projectId: r.project_id,
  containerId: r.container_id,
  ports: parseJson(r.ports, []),
  memoryMb: r.memory_mb,
  startedAt: r.started_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const mapActivity = (r) => ({
  id: r.id,
  projectId: r.project_id,
  type: r.type,
  title: r.title,
  description: r.description,
  meta: parseJson(r.meta, {}),
  createdAt: r.created_at,
});

export const mapRepo = (r) => ({
  ...camelize(r),
  projectId: r.project_id,
  fullName: r.full_name,
  defaultBranch: r.default_branch,
  openIssues: r.open_issues,
  openPrs: r.open_prs,
  data: parseJson(r.data, {}),
  syncedAt: r.synced_at,
});
