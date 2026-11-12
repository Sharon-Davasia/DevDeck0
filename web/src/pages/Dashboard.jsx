import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { useRealtime } from '../lib/realtime.js';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  Progress,
  Skeleton,
  SkeletonCard,
  StatusDot,
  Tooltip,
} from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import {
  PRIORITY,
  RUN_STATUS,
  SERVICE_STATUS,
  ACTIVITY_META,
  dueLabel,
  formatDuration,
  relativeTime,
  formatUptime,
} from '../lib/format.js';
import { useToast } from '../lib/ToastContext.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, loading, error, refresh, setData } = useApi('/dashboard');
  const [toggling, setToggling] = useState(null);

  const { connected } = useRealtime({
    'activity:new': () => refresh({ silent: true }),
    'service:updated': () => refresh({ silent: true }),
    'command:done': () => refresh({ silent: true }),
  });

  // Poll quietly as a fallback when SSE is unavailable.
  useEffect(() => {
    const t = setInterval(() => refresh({ silent: true }), 45_000);
    return () => clearInterval(t);
  }, [refresh]);

  const completeTask = useCallback(
    async (task) => {
      setToggling(task.id);
      // Optimistic: mark it done locally first.
      setData((prev) => ({
        ...prev,
        tasksDueToday: prev.tasksDueToday.filter((t) => t.id !== task.id),
        stats: { ...prev.stats, tasksCompletedToday: prev.stats.tasksCompletedToday + 1 },
      }));
      try {
        await api.patch(`/tasks/${task.id}`, { status: 'done' });
        toast.success('Task completed', { description: task.title });
        refresh({ silent: true });
      } catch (err) {
        toast.error(err.message);
        refresh({ silent: true });
      } finally {
        setToggling(null);
      }
    },
    [refresh, setData, toast]
  );

  if (loading && !data) return <DashboardSkeleton />;
  if (error && !data) return <ErrorState error={error} onRetry={() => refresh()} />;

  const { stats = {}, projects = [], tasksDueToday = [], recentRuns = [], services = [], recentCommits = [], activity = [], week = [], notes = [], docker } = data || {};
  const hour = new Date().getHours();
  const firstName = (user?.name || 'there').split(' ')[0];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[21px] font-bold tracking-[-0.02em] text-ink">
              {data?.greeting || 'Hello'}, {firstName}
            </h1>
            <Tooltip label={connected ? 'Live updates connected' : 'Reconnecting…'}>
              <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5">
                <StatusDot className={connected ? 'bg-emerald-500' : 'bg-amber-400'} pulse={connected} />
                <span className="text-[10.5px] font-semibold text-muted">{connected ? 'Live' : 'Offline'}</span>
              </span>
            </Tooltip>
          </div>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {stats.tasksDueToday > 0
              ? `${stats.tasksDueToday} task${stats.tasksDueToday === 1 ? '' : 's'} due today · `
              : 'Nothing due today · '}
            {stats.runningServices} service{stats.runningServices === 1 ? '' : 's'} running ·{' '}
            {stats.commandsToday} command{stats.commandsToday === 1 ? '' : 's'} run
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon="refresh" onClick={() => refresh()} loading={loading && !!data}>
            Refresh
          </Button>
          <Button variant="primary" size="sm" icon="plus" onClick={() => navigate('/tasks?new=1')}>
            New task
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Active projects"
          value={stats.activeProjects}
          icon="folder"
          tone="brand"
          hint={`${projects.length} in your workspace`}
          to="/projects"
        />
        <StatCard
          label="Open tasks"
          value={stats.openTasks}
          icon="check-square"
          tone="sky"
          hint={stats.overdueTasks > 0 ? `${stats.overdueTasks} overdue` : `${stats.tasksDueToday} due today`}
          hintTone={stats.overdueTasks > 0 ? 'danger' : 'neutral'}
          to="/tasks"
        />
        <StatCard
          label="Commands today"
          value={stats.commandsToday}
          icon="terminal"
          tone="violet"
          hint={stats.commandsFailedToday > 0 ? `${stats.commandsFailedToday} failed` : 'All successful'}
          hintTone={stats.commandsFailedToday > 0 ? 'danger' : 'neutral'}
          to="/commands"
        />
        <StatCard
          label="Commits this week"
          value={stats.commitsWeek}
          icon="git-commit"
          tone="emerald"
          hint={`${stats.commitsToday} today`}
          to="/github"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Left column (2/3) */}
        <div className="space-y-4 xl:col-span-2">
          {/* Due today */}
          <section className="card overflow-hidden">
            <SectionHeader
              title="Due today"
              subtitle="Tasks that need attention right now"
              icon="calendar"
              action={
                <Link to="/tasks" className="text-[12px] font-semibold text-brand-600 hover:underline">
                  View all tasks
                </Link>
              }
            />
            {tasksDueToday.length === 0 ? (
              <EmptyState
                icon="check-circle"
                title="You're all caught up"
                description="No tasks are due today. Enjoy the clear runway — or pull something forward from the backlog."
                compact
                action={
                  <Button size="sm" variant="secondary" icon="plus" onClick={() => navigate('/tasks?new=1')}>
                    Add a task
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-line-soft">
                {tasksDueToday.map((task) => {
                  const due = dueLabel(task.dueDate, task.status);
                  const priority = PRIORITY[task.priority] || PRIORITY.medium;
                  return (
                    <li key={task.id} className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[#fafbfd]">
                      <button
                        onClick={() => completeTask(task)}
                        disabled={toggling === task.id}
                        className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] border-[#cfd5e0] text-transparent transition-all hover:border-brand-500 hover:text-brand-500 disabled:opacity-50"
                        aria-label={`Complete ${task.title}`}
                      >
                        <Icon name="check" size={11} strokeWidth={3} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink">{task.title}</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          {task.projectName && (
                            <span className="flex items-center gap-1 text-[11px] text-muted">
                              <Icon name="folder" size={10} />
                              {task.projectName}
                            </span>
                          )}
                          {due && (
                            <span
                              className={`text-[11px] font-medium ${
                                due.tone === 'danger'
                                  ? 'text-red-600'
                                  : due.tone === 'warning'
                                    ? 'text-amber-600'
                                    : 'text-muted'
                              }`}
                            >
                              · {due.text}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge className={priority.className} dot={priority.dot}>
                        {priority.label}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Projects grid */}
          <section className="card overflow-hidden">
            <SectionHeader
              title="Active projects"
              subtitle="Jump straight back into your work"
              icon="folder"
              action={
                <Link to="/projects" className="text-[12px] font-semibold text-brand-600 hover:underline">
                  All projects
                </Link>
              }
            />
            {projects.length === 0 ? (
              <EmptyState
                icon="folder"
                title="No projects yet"
                description="Create your first project to start tracking tasks, commands, services and notes."
                compact
                action={
                  <Button size="sm" variant="primary" icon="plus" onClick={() => navigate('/projects?new=1')}>
                    New project
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-px bg-line-soft sm:grid-cols-2">
                {projects.slice(0, 4).map((p) => {
                  const total = (p.counts?.openTasks || 0) + (p.counts?.doneTasks || 0);
                  const pct = total ? Math.round(((p.counts?.doneTasks || 0) / total) * 100) : 0;
                  return (
                    <Link
                      key={p.id}
                      to={`/projects/${p.id}`}
                      className="group relative bg-surface p-4 transition-colors hover:bg-[#fbfcfe]"
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white"
                          style={{ background: p.color }}
                        >
                          <Icon name="folder" size={13} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-[13px] font-semibold text-ink group-hover:text-brand-700">
                              {p.name}
                            </p>
                            <Badge className="bg-line-soft text-[10px] text-muted">{p.environment}</Badge>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted">
                            {p.description || 'No description yet'}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <Progress value={pct} className="flex-1" tone={pct === 100 ? 'bg-emerald-500' : 'bg-brand-500'} />
                        <span className="text-[10.5px] font-semibold tabular-nums text-muted">{pct}%</span>
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-[10.5px] text-muted">
                        <span className="flex items-center gap-1">
                          <Icon name="check-square" size={10} />
                          {p.counts?.openTasks || 0} open
                        </span>
                        <span className="flex items-center gap-1">
                          <Icon name="note" size={10} />
                          {p.counts?.notes || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <Icon name="terminal" size={10} />
                          {p.counts?.commands || 0}
                        </span>
                        {p.counts?.runningServices > 0 && (
                          <span className="flex items-center gap-1 text-emerald-600">
                            <StatusDot className="bg-emerald-500" />
                            {p.counts.runningServices}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {/* Recent commands */}
          <section className="card overflow-hidden">
            <SectionHeader
              title="Recent commands"
              subtitle="Latest executions from your command library"
              icon="terminal"
              action={
                <Link to="/commands" className="text-[12px] font-semibold text-brand-600 hover:underline">
                  Open library
                </Link>
              }
            />
            {recentRuns.length === 0 ? (
              <EmptyState
                icon="terminal"
                title="No commands run yet"
                description="Save a command to your library and run it here with streamed output."
                compact
                action={
                  <Button size="sm" variant="secondary" icon="terminal" onClick={() => navigate('/commands')}>
                    Go to commands
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Command</th>
                      <th className="hidden sm:table-cell">Project</th>
                      <th>Status</th>
                      <th className="hidden md:table-cell text-right">Duration</th>
                      <th className="text-right">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRuns.map((run) => {
                      const s = RUN_STATUS[run.status] || RUN_STATUS.running;
                      return (
                        <tr key={run.id}>
                          <td className="max-w-[220px]">
                            <p className="truncate text-[12.5px] font-medium text-ink">{run.label || run.command}</p>
                            <p className="truncate font-mono text-[10.5px] text-muted">{run.command}</p>
                          </td>
                          <td className="hidden sm:table-cell">
                            {run.projectName ? (
                              <span className="chip">{run.projectName}</span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td>
                            <Badge className={s.className}>{s.label}</Badge>
                          </td>
                          <td className="hidden text-right font-mono text-[11.5px] tabular-nums text-muted md:table-cell">
                            {formatDuration(run.durationMs)}
                          </td>
                          <td className="whitespace-nowrap text-right text-[11.5px] text-muted">
                            {relativeTime(run.startedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Week activity */}
          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="section-title">This week</h3>
                <p className="meta mt-0.5">Daily activity across the deck</p>
              </div>
              <Badge className="bg-brand-50 text-brand-700">
                {week.reduce((s, d) => s + d.total, 0)} events
              </Badge>
            </div>
            <WeekChart week={week} />
            <div className="mt-3 flex items-center gap-3 text-[10.5px] text-muted">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> commands
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> tasks
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> commits
              </span>
            </div>
          </section>

          {/* Services */}
          <section className="card overflow-hidden">
            <SectionHeader
              title="Services"
              icon="server"
              subtitle={docker?.connected ? 'Docker daemon connected' : 'Tracked services'}
              action={
                <Link to="/services" className="text-[12px] font-semibold text-brand-600 hover:underline">
                  Manage
                </Link>
              }
            />
            {services.length === 0 ? (
              <EmptyState icon="server" title="No services tracked" description="Add a service to monitor it." compact />
            ) : (
              <ul className="divide-y divide-line-soft">
                {services.map((svc) => {
                  const s = SERVICE_STATUS[svc.status] || SERVICE_STATUS.stopped;
                  return (
                    <li key={svc.id} className="flex items-center gap-2.5 px-4 py-2.5">
                      <StatusDot className={s.dot} pulse={svc.status === 'running'} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium text-ink">{svc.name}</p>
                        <p className="truncate font-mono text-[10.5px] text-muted">
                          {svc.ports?.[0] || svc.image || '—'}
                        </p>
                      </div>
                      {svc.status === 'running' && (
                        <div className="text-right">
                          <p className="text-[10.5px] font-semibold tabular-nums text-emerald-600">{svc.cpu}%</p>
                          <p className="text-[10px] tabular-nums text-muted">{Math.round(svc.memoryMb)}MB</p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Commits */}
          <section className="card overflow-hidden">
            <SectionHeader
              title="Recent commits"
              icon="git-commit"
              action={
                <Link to="/github" className="text-[12px] font-semibold text-brand-600 hover:underline">
                  GitHub
                </Link>
              }
            />
            {recentCommits.length === 0 ? (
              <EmptyState icon="git-commit" title="No commits synced" description="Link a repository to see commits." compact />
            ) : (
              <ul className="divide-y divide-line-soft">
                {recentCommits.slice(0, 5).map((c, i) => (
                  <li key={`${c.sha}-${i}`} className="px-4 py-2.5">
                    <p className="line-clamp-2 text-[12px] font-medium leading-snug text-ink">{c.message}</p>
                    <div className="mt-1 flex items-center gap-2 text-[10.5px] text-muted">
                      <span className="font-mono">{c.sha}</span>
                      <span>·</span>
                      <span className="truncate">{c.author}</span>
                      <span className="ml-auto shrink-0">{relativeTime(c.date)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Activity */}
          <section className="card overflow-hidden">
            <SectionHeader
              title="Activity"
              icon="activity"
              action={
                <Link to="/activity" className="text-[12px] font-semibold text-brand-600 hover:underline">
                  Timeline
                </Link>
              }
            />
            <ul className="divide-y divide-line-soft">
              {activity.slice(0, 6).map((a) => {
                const meta = ACTIVITY_META[a.type] || ACTIVITY_META.system;
                return (
                  <li key={a.id} className="flex items-start gap-2.5 px-4 py-2.5">
                    <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md ring-1 ${meta.tone}`}>
                      <Icon
                        name={
                          a.type === 'command'
                            ? 'terminal'
                            : a.type === 'commit'
                              ? 'git-commit'
                              : a.type === 'task'
                                ? 'check-square'
                                : a.type === 'service'
                                  ? 'server'
                                  : a.type === 'note'
                                    ? 'note'
                                    : a.type === 'github'
                                      ? 'git-branch'
                                      : 'folder'
                        }
                        size={12}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[12px] leading-snug text-ink">{a.title}</p>
                      <p className="mt-0.5 text-[10.5px] text-muted">
                        {relativeTime(a.createdAt)}
                        {a.projectName ? ` · ${a.projectName}` : ''}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Notes */}
          {notes.length > 0 && (
            <section className="card overflow-hidden">
              <SectionHeader
                title="Recent notes"
                icon="note"
                action={
                  <Link to="/notes" className="text-[12px] font-semibold text-brand-600 hover:underline">
                    All notes
                  </Link>
                }
              />
              <ul className="divide-y divide-line-soft">
                {notes.slice(0, 4).map((n) => (
                  <li key={n.id}>
                    <Link
                      to={`/notes/${n.id}`}
                      className="flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-[#fafbfd]"
                    >
                      <Icon name="note" size={13} className="shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">{n.title}</span>
                      <span className="shrink-0 text-[10.5px] text-muted">{relativeTime(n.updated_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

const TONES = {
  brand: 'bg-brand-50 text-brand-600 ring-brand-100',
  sky: 'bg-sky-50 text-sky-600 ring-sky-100',
  violet: 'bg-violet-50 text-violet-600 ring-violet-100',
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
};

function StatCard({ label, value, icon, tone = 'brand', hint, hintTone = 'neutral', to }) {
  const content = (
    <>
      <div className="flex items-start justify-between">
        <span className={`grid h-8 w-8 place-items-center rounded-lg ring-1 ${TONES[tone]}`}>
          <Icon name={icon} size={15} />
        </span>
        {to && (
          <Icon
            name="arrow-up-right"
            size={13}
            className="text-muted/50 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand-500"
          />
        )}
      </div>
      <p className="mt-3 text-[26px] font-bold leading-none tracking-[-0.03em] tabular-nums text-ink">{value ?? 0}</p>
      <p className="mt-1 text-[12px] font-medium text-soft">{label}</p>
      {hint && (
        <p className={`mt-0.5 text-[10.5px] ${hintTone === 'danger' ? 'font-medium text-red-600' : 'text-muted'}`}>
          {hint}
        </p>
      )}
    </>
  );
  return to ? (
    <Link to={to} className="group card card-hover p-3.5">
      {content}
    </Link>
  ) : (
    <div className="card p-3.5">{content}</div>
  );
}

function WeekChart({ week }) {
  const max = Math.max(1, ...week.map((d) => Math.max(d.commands, d.tasks, d.commits, 1)));
  return (
    <div className="flex items-end justify-between gap-1.5" style={{ height: 92 }}>
      {week.map((d) => {
        const total = d.total;
        return (
          <Tooltip key={d.date} label={`${d.label}: ${d.commands} cmd · ${d.tasks} tasks · ${d.commits} commits`}>
            <div className="group flex h-full flex-1 flex-col items-center justify-end gap-1 pt-1">
              <div className="relative flex w-full items-end justify-center" style={{ height: '100%' }}>
                <div
                  className="flex w-full max-w-[22px] flex-col justify-end overflow-hidden rounded-[4px] bg-[#eef0f5] transition-all group-hover:bg-[#e6e9f0]"
                  style={{ height: '100%' }}
                >
                  <div
                    className="w-full bg-violet-400/80"
                    style={{ height: `${(d.commits / max) * 100}%` }}
                  />
                  <div className="w-full bg-emerald-400" style={{ height: `${(d.tasks / max) * 100}%` }} />
                  <div className="w-full bg-brand-500" style={{ height: `${(d.commands / max) * 100}%` }} />
                </div>
              </div>
              <span
                className={`text-[9.5px] font-semibold ${
                  total > 0 ? 'text-soft' : 'text-muted/70'
                }`}
              >
                {d.label}
              </span>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}

function SectionHeader({ title, subtitle, icon, action }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        {icon && <Icon name={icon} size={14} className="shrink-0 text-muted" />}
        <div className="min-w-0">
          <h3 className="section-title">{title}</h3>
          {subtitle && <p className="truncate text-[11px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-3 w-80" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-3.5">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="mt-3 h-6 w-14" />
            <Skeleton className="mt-2 h-2.5 w-24" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <div className="card">
            <div className="border-b border-line-soft px-4 py-3">
              <Skeleton className="h-3.5 w-28" />
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-line-soft px-4 py-3">
                <Skeleton className="h-[18px] w-[18px] rounded" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2 w-1/4" />
                </div>
                <Skeleton className="h-4 w-14 rounded" />
              </div>
            ))}
          </div>
          <SkeletonCard lines={2} />
        </div>
        <div className="space-y-4">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    </div>
  );
}
