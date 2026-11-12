import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { useApi, useDebounced } from '../lib/useApi.js';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  Modal,
  Progress,
  SearchInput,
  Select,
  Skeleton,
  Tabs,
  Tooltip,
  useConfirm,
} from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { relativeTime } from '../lib/format.js';

const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6'];
const ENVIRONMENTS = ['local', 'staging', 'production', 'sandbox'];

const emptyForm = {
  name: '',
  description: '',
  techStack: '',
  repoUrl: '',
  localPath: '',
  environment: 'local',
  color: COLORS[0],
};

export default function Projects() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState('active');
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 220);
  const [view, setView] = useState(() => localStorage.getItem('devdeck.projects.view') || 'grid');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState(null);

  const { data, loading, error, refresh, setData } = useApi(
    `/projects${qs({ status, q: debounced })}`,
    { deps: [status, debounced], initialData: [] }
  );

  useEffect(() => {
    if (params.get('new') === '1') {
      openCreate();
      params.delete('new');
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem('devdeck.projects.view', view);
  }, [view]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(project) {
    setEditing(project);
    setForm({
      name: project.name,
      description: project.description || '',
      techStack: (project.techStack || []).join(', '),
      repoUrl: project.repoUrl || '',
      localPath: project.localPath || '',
      environment: project.environment,
      color: project.color,
    });
    setFormError(null);
    setModalOpen(true);
  }

  const projects = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const payload = {
      name: form.name.trim(),
      description: form.description,
      techStack: form.techStack
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      repoUrl: form.repoUrl.trim() || null,
      localPath: form.localPath.trim() || null,
      environment: form.environment,
      color: form.color,
    };
    try {
      if (editing) {
        const res = await api.patch(`/projects/${editing.id}`, payload);
        setData((prev) => prev.map((p) => (p.id === editing.id ? { ...p, ...res.data } : p)));
        toast.success('Project updated');
      } else {
        const res = await api.post('/projects', payload);
        setData((prev) => [{ ...res.data, counts: {} }, ...prev]);
        toast.success('Project created', { description: res.data.name });
      }
      setModalOpen(false);
      refresh({ silent: true });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function archive(project) {
    const next = project.status === 'archived' ? 'active' : 'archived';
    setData((prev) => prev.map((p) => (p.id === project.id ? { ...p, status: next } : p)));
    try {
      await api.patch(`/projects/${project.id}`, { status: next });
      toast.success(next === 'archived' ? 'Project archived' : 'Project restored');
      refresh({ silent: true });
    } catch (err) {
      toast.error(err.message);
      refresh({ silent: true });
    }
  }

  async function remove(project) {
    const ok = await confirm({
      title: `Delete “${project.name}”?`,
      description: 'This removes the project and detaches its tasks, notes and commands.',
      confirmLabel: 'Delete project',
    });
    if (!ok) return;
    const snapshot = projects;
    setData((prev) => prev.filter((p) => p.id !== project.id));
    try {
      await api.del(`/projects/${project.id}`);
      toast.success('Project deleted');
    } catch (err) {
      setData(snapshot);
      toast.error(err.message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Each project bundles its stack, repository, tasks, notes, commands and services."
        actions={
          <>
            <div className="hidden items-center rounded-lg border border-line bg-surface p-0.5 sm:flex">
              {[
                { v: 'grid', icon: 'grid' },
                { v: 'list', icon: 'list' },
              ].map((o) => (
                <button
                  key={o.v}
                  onClick={() => setView(o.v)}
                  className={`grid h-7 w-7 place-items-center rounded-md transition-colors ${
                    view === o.v ? 'bg-line-soft text-ink' : 'text-muted hover:text-ink'
                  }`}
                  aria-label={`${o.v} view`}
                >
                  <Icon name={o.icon} size={14} />
                </button>
              ))}
            </div>
            <Button variant="primary" size="sm" icon="plus" onClick={openCreate}>
              New project
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <Tabs
          value={status}
          onChange={setStatus}
          tabs={[
            { value: 'active', label: 'Active', icon: 'folder' },
            { value: 'archived', label: 'Archived', icon: 'layers' },
            { value: 'all', label: 'All', icon: 'grid' },
          ]}
        />
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search projects…"
          className="sm:ml-auto sm:w-64"
        />
      </div>

      {loading && !projects.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-4">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="mt-3 h-3.5 w-2/3" />
              <Skeleton className="mt-2 h-2.5 w-full" />
              <Skeleton className="mt-1.5 h-2.5 w-4/5" />
              <Skeleton className="mt-4 h-1.5 w-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refresh()} />
      ) : projects.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="folder"
            title={query ? 'No projects match that search' : status === 'archived' ? 'No archived projects' : 'Create your first project'}
            description={
              query
                ? 'Try a different term or clear the search to see everything.'
                : 'A project holds your tasks, commands, notes and connected services. Start with the repository you are working in today.'
            }
            action={
              query ? (
                <Button size="sm" variant="secondary" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              ) : (
                <Button size="sm" variant="primary" icon="plus" onClick={openCreate}>
                  New project
                </Button>
              )
            }
          />
        </div>
      ) : view === 'grid' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} onEdit={openEdit} onArchive={archive} onDelete={remove} />
          ))}
          <button
            onClick={openCreate}
            className="group flex min-h-[168px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#d8dce6] bg-transparent transition-colors hover:border-brand-300 hover:bg-brand-50/40"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface text-muted ring-1 ring-line transition-colors group-hover:text-brand-600">
              <Icon name="plus" size={16} />
            </span>
            <span className="text-[12.5px] font-medium text-muted group-hover:text-brand-700">New project</span>
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Project</th>
                  <th className="hidden md:table-cell">Stack</th>
                  <th className="hidden sm:table-cell">Environment</th>
                  <th className="text-center">Open</th>
                  <th className="hidden lg:table-cell">Updated</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/projects/${p.id}`)}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white" style={{ background: p.color }}>
                          <Icon name="folder" size={13} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-ink">{p.name}</p>
                          <p className="truncate text-[11px] text-muted">{p.description || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {(p.techStack || []).slice(0, 3).map((t) => (
                          <span key={t} className="chip">{t}</span>
                        ))}
                        {(p.techStack || []).length > 3 && (
                          <span className="chip">+{p.techStack.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="hidden sm:table-cell">
                      <Badge className="bg-line-soft text-muted">{p.environment}</Badge>
                    </td>
                    <td className="text-center font-mono text-[12px] tabular-nums text-soft">
                      {p.counts?.openTasks ?? 0}
                    </td>
                    <td className="hidden whitespace-nowrap text-[11.5px] text-muted lg:table-cell">
                      {relativeTime(p.updatedAt)}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <IconButton icon="more" label="Project actions" onClick={() => openEdit(p)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit project' : 'New project'}
        description={editing ? 'Update the workspace details.' : 'A project groups everything for one codebase.'}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={save} loading={saving} disabled={!form.name.trim()}>
              {editing ? 'Save changes' : 'Create project'}
            </Button>
          </>
        }
      >
        <form onSubmit={save} className="space-y-3.5">
          <div>
            <label className="field-label">Project name</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Nova Analytics"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="field-label">Description</label>
            <textarea
              className="input min-h-[76px] resize-y"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What does this project do?"
            />
          </div>
          <div>
            <label className="field-label">Tech stack</label>
            <input
              className="input"
              value={form.techStack}
              onChange={(e) => setForm({ ...form, techStack: e.target.value })}
              placeholder="Python, FastAPI, PostgreSQL"
            />
            <p className="hint">Comma separated.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Repository URL</label>
              <input
                className="input"
                value={form.repoUrl}
                onChange={(e) => setForm({ ...form, repoUrl: e.target.value })}
                placeholder="https://github.com/org/repo"
              />
            </div>
            <div>
              <label className="field-label">Local path</label>
              <input
                className="input font-mono text-[12.5px]"
                value={form.localPath}
                onChange={(e) => setForm({ ...form, localPath: e.target.value })}
                placeholder="~/dev/project"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Environment</label>
              <Select
                value={form.environment}
                onChange={(v) => setForm({ ...form, environment: v })}
                options={ENVIRONMENTS.map((e) => ({ value: e, label: e[0].toUpperCase() + e.slice(1) }))}
              />
            </div>
            <div>
              <label className="field-label">Accent color</label>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {COLORS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setForm({ ...form, color: c })}
                    className={`h-6 w-6 rounded-full transition-transform ${
                      form.color === c ? 'ring-2 ring-offset-2 ring-brand-400' : 'hover:scale-110'
                    }`}
                    style={{ background: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>
          {formError && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-700">{formError}</div>
          )}
        </form>
      </Modal>
    </div>
  );
}

function ProjectCard({ project: p, onEdit, onArchive, onDelete }) {
  const total = (p.counts?.openTasks || 0) + (p.counts?.doneTasks || 0);
  const pct = total ? Math.round(((p.counts?.doneTasks || 0) / total) * 100) : 0;
  return (
    <div className="group card card-hover relative flex flex-col p-4">
      <div className="flex items-start gap-3">
        <Link
          to={`/projects/${p.id}`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white shadow-sm"
          style={{ background: p.color }}
        >
          <Icon name="folder" size={16} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Link to={`/projects/${p.id}`} className="truncate text-[13.5px] font-semibold text-ink hover:text-brand-700">
              {p.name}
            </Link>
            {p.status === 'archived' && <Badge className="bg-line-soft text-muted">Archived</Badge>}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
            <Badge className="bg-line-soft text-muted">{p.environment}</Badge>
            <span>·</span>
            <span>{relativeTime(p.updatedAt)}</span>
          </div>
        </div>
        <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Tooltip label="Edit">
            <IconButton icon="edit" label="Edit project" onClick={() => onEdit(p)} />
          </Tooltip>
          <Tooltip label={p.status === 'archived' ? 'Restore' : 'Archive'}>
            <IconButton
              icon={p.status === 'archived' ? 'refresh' : 'layers'}
              label={p.status === 'archived' ? 'Restore project' : 'Archive project'}
              onClick={() => onArchive(p)}
            />
          </Tooltip>
          <Tooltip label="Delete">
            <IconButton icon="trash" label="Delete project" onClick={() => onDelete(p)} className="hover:text-red-600" />
          </Tooltip>
        </div>
      </div>

      <Link to={`/projects/${p.id}`} className="mt-3 block flex-1">
        <p className="line-clamp-2 text-[12px] leading-relaxed text-muted">
          {p.description || 'No description yet.'}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1">
          {(p.techStack || []).slice(0, 4).map((t) => (
            <span key={t} className="chip">{t}</span>
          ))}
          {(p.techStack || []).length > 4 && <span className="chip">+{p.techStack.length - 4}</span>}
        </div>
      </Link>

      <div className="mt-3.5">
        <div className="mb-1 flex items-center justify-between text-[10.5px]">
          <span className="font-medium text-muted">
            {p.counts?.doneTasks || 0}/{total} tasks done
          </span>
          <span className="font-semibold tabular-nums text-soft">{pct}%</span>
        </div>
        <Progress value={pct} tone={pct === 100 && total > 0 ? 'bg-emerald-500' : 'bg-brand-500'} />
      </div>

      <div className="mt-3 flex items-center gap-3 border-t border-line-soft pt-2.5 text-[10.5px] text-muted">
        <span className="flex items-center gap-1">
          <Icon name="check-square" size={11} /> {p.counts?.openTasks || 0}
        </span>
        <span className="flex items-center gap-1">
          <Icon name="note" size={11} /> {p.counts?.notes || 0}
        </span>
        <span className="flex items-center gap-1">
          <Icon name="terminal" size={11} /> {p.counts?.commands || 0}
        </span>
        <span className="flex items-center gap-1">
          <Icon name="server" size={11} /> {p.counts?.runningServices || 0}
        </span>
        {p.repoUrl && (
          <a
            href={p.repoUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="ml-auto flex items-center gap-1 text-muted transition-colors hover:text-brand-600"
          >
            <Icon name="git" size={11} /> repo
          </a>
        )}
      </div>
    </div>
  );
}
