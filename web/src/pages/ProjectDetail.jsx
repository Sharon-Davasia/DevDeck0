import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import {
  Badge,
  Button,
  CodeBlock,
  EmptyState,
  ErrorState,
  IconButton,
  Skeleton,
  StatusDot,
  Tabs,
  useConfirm,
} from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import {
  ACTIVITY_META,
  NOTE_KIND,
  PRIORITY,
  RUN_STATUS,
  SERVICE_STATUS,
  STATUS,
  dueLabel,
  formatDuration,
  relativeTime,
} from '../lib/format.js';

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: project, loading, error, refresh, setData } = useApi(`/projects/${id}`);
  const [tab, setTab] = useState('tasks');

  if (loading && !project) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-52" />
        <div className="card p-5">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="mt-3 h-4 w-1/3" />
          <Skeleton className="mt-2 h-3 w-2/3" />
        </div>
      </div>
    );
  }
  if (error) return <ErrorState error={error} onRetry={() => refresh()} />;
  if (!project) return null;

  const tasks = project.tasks || [];
  const openTasks = tasks.filter((t) => t.status !== 'done');
  const doneTasks = tasks.filter((t) => t.status === 'done');
  const running = (project.services || []).filter((s) => s.status === 'running');

  async function toggleTask(task) {
    const next = task.status === 'done' ? 'todo' : 'done';
    setData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === task.id ? { ...t, status: next } : t)),
    }));
    try {
      await api.patch(`/tasks/${task.id}`, { status: next });
    } catch (err) {
      toast.error(err.message);
      refresh({ silent: true });
    }
  }

  async function runSaved(command) {
    try {
      const res = await api.post('/commands/run', { commandId: command.id });
      toast.success('Command started', { description: `${command.name} · run ${res.data.id.slice(0, 8)}` });
      navigate(`/commands?tab=history&run=${res.data.id}`);
    } catch (err) {
      if (err.status === 428) {
        const ok = await confirm({
          title: 'Dangerous command',
          description: 'This command is flagged by policy.',
          body: <p className="text-[13px]">{err.message}</p>,
          confirmLabel: 'Run anyway',
        });
        if (!ok) return;
        try {
          const res = await api.post('/commands/run', { commandId: command.id, force: true });
          navigate(`/commands?tab=history&run=${res.data.id}`);
        } catch (e) {
          toast.error(e.message);
        }
        return;
      }
      toast.error(err.message);
    }
  }

  async function archive() {
    const next = project.status === 'archived' ? 'active' : 'archived';
    setData((prev) => ({ ...prev, status: next }));
    try {
      await api.patch(`/projects/${id}`, { status: next });
      toast.success(next === 'archived' ? 'Project archived' : 'Project restored');
    } catch (err) {
      toast.error(err.message);
      refresh({ silent: true });
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete “${project.name}”?`,
      description: 'Tasks, notes and commands linked to this project will be detached.',
      confirmLabel: 'Delete project',
    });
    if (!ok) return;
    try {
      await api.del(`/projects/${id}`);
      toast.success('Project deleted');
      navigate('/projects');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function serviceAction(svc, action) {
    setData((prev) => ({
      ...prev,
      services: prev.services.map((s) =>
        s.id === svc.id ? { ...s, status: action === 'stop' ? 'stopped' : 'running' } : s
      ),
    }));
    try {
      await api.post(`/services/${svc.id}/${action}`);
      toast.success(`${svc.name} ${action === 'stop' ? 'stopped' : action === 'start' ? 'started' : 'restarted'}`);
      refresh({ silent: true });
    } catch (err) {
      toast.error(err.message);
      refresh({ silent: true });
    }
  }

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-1.5 text-[12px] text-muted">
        <Link to="/projects" className="transition-colors hover:text-ink">
          Projects
        </Link>
        <Icon name="chevron-right" size={11} />
        <span className="font-medium text-soft">{project.name}</span>
      </nav>

      {/* Hero */}
      <div className="card overflow-hidden">
        <div className="relative h-1" style={{ background: `linear-gradient(90deg, ${project.color}, ${project.color}44 60%, transparent)` }} />
        <div className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 gap-3.5">
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white shadow-sm"
                style={{ background: project.color }}
              >
                <Icon name="folder" size={19} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-[19px] font-bold tracking-[-0.02em] text-ink">{project.name}</h1>
                  <Badge className="bg-line-soft text-muted">{project.environment}</Badge>
                  {project.status === 'archived' && <Badge className="bg-amber-50 text-amber-700">Archived</Badge>}
                </div>
                <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-soft">
                  {project.description || 'No description yet.'}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-muted">
                  {project.localPath && (
                    <span className="flex items-center gap-1 font-mono">
                      <Icon name="code" size={11} /> {project.localPath}
                    </span>
                  )}
                  {project.repoUrl && (
                    <a
                      href={project.repoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 transition-colors hover:text-brand-600"
                    >
                      <Icon name="git" size={11} /> {project.repoUrl.replace('https://github.com/', '')}
                    </a>
                  )}
                  <span className="flex items-center gap-1">
                    <Icon name="clock" size={11} /> updated {relativeTime(project.updatedAt)}
                  </span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {(project.techStack || []).map((t) => (
                    <span key={t} className="chip">{t}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button variant="secondary" size="sm" icon="play" onClick={() => navigate('/commands')}>
                Commands
              </Button>
              <Button variant="secondary" size="sm" icon={project.status === 'archived' ? 'refresh' : 'layers'} onClick={archive}>
                {project.status === 'archived' ? 'Restore' : 'Archive'}
              </Button>
              <IconButton icon="trash" label="Delete project" onClick={remove} className="hover:text-red-600" />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line-soft sm:grid-cols-4">
            {[
              { label: 'Open tasks', value: openTasks.length, icon: 'check-square' },
              { label: 'Notes', value: (project.notes || []).length, icon: 'note' },
              { label: 'Saved commands', value: (project.commands || []).length, icon: 'terminal' },
              { label: 'Running services', value: running.length, icon: 'server' },
            ].map((s) => (
              <div key={s.label} className="bg-surface px-3.5 py-2.5">
                <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted">
                  <Icon name={s.icon} size={11} /> {s.label}
                </div>
                <p className="mt-0.5 text-[17px] font-bold tabular-nums text-ink">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        className="rounded-xl border border-line bg-canvas p-1"
        tabs={[
          { value: 'tasks', label: 'Tasks', icon: 'check-square', count: openTasks.length },
          { value: 'notes', label: 'Notes', icon: 'note', count: (project.notes || []).length },
          { value: 'commands', label: 'Commands', icon: 'terminal', count: (project.commands || []).length },
          { value: 'services', label: 'Services', icon: 'server', count: (project.services || []).length },
          { value: 'activity', label: 'Activity', icon: 'activity' },
        ]}
      />

      {tab === 'tasks' && (
        <div className="card overflow-hidden">
          {tasks.length === 0 ? (
            <EmptyState
              icon="check-square"
              title="No tasks in this project"
              description="Break the work down into tasks so nothing slips."
              action={
                <Button size="sm" variant="primary" icon="plus" onClick={() => navigate('/tasks?new=1')}>
                  Add a task
                </Button>
              }
            />
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-line-soft px-4 py-2.5">
                <p className="text-[11.5px] text-muted">
                  {doneTasks.length} of {tasks.length} completed
                </p>
                <Link to="/tasks" className="text-[12px] font-semibold text-brand-600 hover:underline">
                  Open task board
                </Link>
              </div>
              <ul className="divide-y divide-line-soft">
                {tasks.map((t) => {
                  const priority = PRIORITY[t.priority] || PRIORITY.medium;
                  const due = dueLabel(t.dueDate, t.status);
                  return (
                    <li key={t.id} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-[#fafbfd]">
                      <button
                        onClick={() => toggleTask(t)}
                        className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] transition-all ${
                          t.status === 'done'
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-[#cfd5e0] text-transparent hover:border-brand-500 hover:text-brand-500'
                        }`}
                        aria-label={t.status === 'done' ? 'Reopen task' : 'Complete task'}
                      >
                        <Icon name="check" size={11} strokeWidth={3} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-[13px] ${t.status === 'done' ? 'text-muted line-through' : 'font-medium text-ink'}`}>
                          {t.title}
                        </p>
                        {t.description && (
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted">{t.description}</p>
                        )}
                      </div>
                      {due && (
                        <span
                          className={`hidden whitespace-nowrap text-[11px] font-medium sm:block ${
                            due.tone === 'danger' ? 'text-red-600' : due.tone === 'warning' ? 'text-amber-600' : 'text-muted'
                          }`}
                        >
                          {due.text}
                        </span>
                      )}
                      <Badge className={priority.className} dot={priority.dot}>
                        {priority.label}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}

      {tab === 'notes' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(project.notes || []).length === 0 ? (
            <div className="card sm:col-span-2">
              <EmptyState
                icon="note"
                title="No notes yet"
                description="Capture decisions, debugging findings and snippets against this project."
                action={
                  <Button size="sm" variant="primary" icon="plus" onClick={() => navigate('/notes?new=1')}>
                    Write a note
                  </Button>
                }
              />
            </div>
          ) : (
            project.notes.map((n) => {
              const kind = NOTE_KIND[n.kind] || NOTE_KIND.note;
              return (
                <Link key={n.id} to={`/notes/${n.id}`} className="card card-hover group p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Icon name={kind.icon} size={13} className="text-muted" />
                      <Badge className="bg-line-soft text-muted">{kind.label}</Badge>
                      {n.pinned && <Icon name="pin" size={11} className="text-amber-500" />}
                    </div>
                    <span className="shrink-0 text-[10.5px] text-muted">{relativeTime(n.updatedAt)}</span>
                  </div>
                  <p className="mt-2 text-[13px] font-semibold text-ink group-hover:text-brand-700">{n.title}</p>
                  <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-muted">
                    {n.body.replace(/[#*`>|-]/g, '').slice(0, 160)}
                  </p>
                </Link>
              );
            })
          )}
        </div>
      )}

      {tab === 'commands' && (
        <div className="card overflow-hidden">
          {(project.commands || []).length === 0 ? (
            <EmptyState
              icon="terminal"
              title="No saved commands"
              description="Save the commands you run repeatedly for this project."
              action={
                <Button size="sm" variant="primary" icon="plus" onClick={() => navigate('/commands?new=1')}>
                  Save a command
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-line-soft">
              {project.commands.map((c) => (
                <li key={c.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-semibold text-ink">{c.name}</p>
                        {c.approved && <Badge className="bg-emerald-50 text-emerald-700">approved</Badge>}
                      </div>
                      {c.description && <p className="mt-0.5 text-[11.5px] text-muted">{c.description}</p>}
                    </div>
                    <Button variant="secondary" size="sm" icon="play" onClick={() => runSaved(c)}>
                      Run
                    </Button>
                  </div>
                  <div className="mt-2">
                    <CodeBlock code={c.command} maxHeight={120} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'services' && (
        <div className="card overflow-hidden">
          {(project.services || []).length === 0 ? (
            <EmptyState
              icon="server"
              title="No services tracked"
              description="Add containers or processes to monitor them here."
              action={
                <Button size="sm" variant="primary" icon="plus" onClick={() => navigate('/services')}>
                  Track a service
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Status</th>
                    <th className="hidden sm:table-cell">Ports</th>
                    <th className="hidden md:table-cell">Uptime</th>
                    <th className="w-28" />
                  </tr>
                </thead>
                <tbody>
                  {project.services.map((s) => {
                    const st = SERVICE_STATUS[s.status] || SERVICE_STATUS.stopped;
                    return (
                      <tr key={s.id}>
                        <td>
                          <p className="text-[12.5px] font-medium text-ink">{s.name}</p>
                          <p className="font-mono text-[10.5px] text-muted">{s.image || s.kind}</p>
                        </td>
                        <td>
                          <span className="flex items-center gap-1.5">
                            <StatusDot className={st.dot} pulse={s.status === 'running'} />
                            <span className="text-[12px] text-soft">{st.label}</span>
                          </span>
                        </td>
                        <td className="hidden font-mono text-[11px] text-muted sm:table-cell">
                          {s.ports?.join(', ') || '—'}
                        </td>
                        <td className="hidden text-[11.5px] text-muted md:table-cell">
                          {s.startedAt && s.status === 'running'
                            ? `${Math.max(1, Math.round((Date.now() - Date.parse(s.startedAt)) / 3600000))}h`
                            : '—'}
                        </td>
                        <td>
                          <div className="flex justify-end gap-1">
                            {s.status === 'running' ? (
                              <IconButton icon="stop" label="Stop" onClick={() => serviceAction(s, 'stop')} />
                            ) : (
                              <IconButton icon="play" label="Start" onClick={() => serviceAction(s, 'start')} />
                            )}
                            <IconButton icon="restart" label="Restart" onClick={() => serviceAction(s, 'restart')} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'activity' && (
        <div className="card overflow-hidden">
          {(project.activity || []).length === 0 ? (
            <EmptyState icon="activity" title="No activity yet" description="Actions in this project will appear here." />
          ) : (
            <ul className="divide-y divide-line-soft">
              {project.activity.map((a) => {
                const meta = ACTIVITY_META[a.type] || ACTIVITY_META.system;
                return (
                  <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                    <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md ring-1 ${meta.tone}`}>
                      <Icon
                        name={
                          a.type === 'command' ? 'terminal' : a.type === 'commit' ? 'git-commit' : a.type === 'task' ? 'check-square' : a.type === 'service' ? 'server' : a.type === 'note' ? 'note' : 'folder'
                        }
                        size={12}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-medium text-ink">{a.title}</p>
                      {a.description && <p className="mt-0.5 text-[11.5px] text-muted">{a.description}</p>}
                    </div>
                    <span className="shrink-0 text-[10.5px] text-muted">{relativeTime(a.created_at)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
