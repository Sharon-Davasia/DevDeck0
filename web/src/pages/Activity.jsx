import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useRealtime } from '../lib/realtime.js';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  Modal,
  Select,
  Skeleton,
  Tabs,
} from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { ACTIVITY_META, formatTime, relativeTime } from '../lib/format.js';

const TYPE_ICON = {
  commit: 'git-commit',
  command: 'terminal',
  task: 'check-square',
  service: 'server',
  note: 'note',
  project: 'folder',
  github: 'git-branch',
  auth: 'shield',
  system: 'info',
};

export default function Activity() {
  const toast = useToast();
  const [type, setType] = useState('all');
  const [projectId, setProjectId] = useState('');
  const [limit, setLimit] = useState(80);
  const [modalOpen, setModalOpen] = useState(false);
  const [entry, setEntry] = useState({ title: '', description: '', type: 'system', projectId: '' });
  const [saving, setSaving] = useState(false);

  const { data, loading, error, refresh, meta } = useApi(
    `/activity${qs({ type: type === 'all' ? undefined : type, projectId: projectId || undefined, limit })}`,
    { deps: [type, projectId, limit] }
  );
  const { data: projects } = useApi('/projects?status=all', { initialData: [] });
  const { data: summary } = useApi('/activity/summary?days=30');

  useRealtime({
    'activity:new': () => refresh({ silent: true }),
  });

  const rows = Array.isArray(data) ? data : [];

  const groups = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const day = (row.createdAt || row.created_at).slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(row);
    }
    return [...map.entries()];
  }, [rows]);

  async function addEntry() {
    if (!entry.title.trim()) return;
    setSaving(true);
    try {
      await api.post('/activity', {
        title: entry.title.trim(),
        description: entry.description,
        type: entry.type,
        projectId: entry.projectId || null,
      });
      toast.success('Logged to your timeline');
      setModalOpen(false);
      setEntry({ title: '', description: '', type: 'system', projectId: '' });
      refresh({ silent: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const dayLabel = (date) => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (date === today) return 'Today';
    if (date === yesterday) return 'Yesterday';
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };

  return (
    <div>
      <PageHeader
        title="Activity"
        subtitle="A chronological record of what you worked on, when, and why."
        actions={
          <>
            <Button variant="secondary" size="sm" icon="refresh" onClick={() => refresh()} loading={loading && !!rows.length}>
              Refresh
            </Button>
            <Button variant="primary" size="sm" icon="plus" onClick={() => setModalOpen(true)}>
              Log entry
            </Button>
          </>
        }
      />

      {summary && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { key: 'command', label: 'Commands', icon: 'terminal', tone: 'text-sky-600 bg-sky-50 ring-sky-100' },
            { key: 'task', label: 'Tasks', icon: 'check-square', tone: 'text-emerald-600 bg-emerald-50 ring-emerald-100' },
            { key: 'commit', label: 'Commits', icon: 'git-commit', tone: 'text-violet-600 bg-violet-50 ring-violet-100' },
            { key: 'note', label: 'Notes', icon: 'note', tone: 'text-pink-600 bg-pink-50 ring-pink-100' },
          ].map((s) => (
            <div key={s.key} className="card flex items-center gap-3 p-3.5">
              <span className={`grid h-8 w-8 place-items-center rounded-lg ring-1 ${s.tone}`}>
                <Icon name={s.icon} size={14} />
              </span>
              <div>
                <p className="text-[17px] font-bold leading-none tabular-nums text-ink">
                  {summary.byType?.[s.key] || 0}
                </p>
                <p className="mt-1 text-[11px] text-muted">{s.label} · 30 days</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={type}
          onChange={setType}
          tabs={[
            { value: 'all', label: 'All' },
            { value: 'command', label: 'Commands' },
            { value: 'task', label: 'Tasks' },
            { value: 'commit', label: 'Commits' },
            { value: 'note', label: 'Notes' },
            { value: 'service', label: 'Services' },
          ]}
        />
        <Select
          value={projectId}
          onChange={setProjectId}
          size="sm"
          className="min-w-[150px] sm:w-44"
          options={[
            { value: '', label: 'All projects' },
            ...(projects || []).map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
      </div>

      {loading && !rows.length ? (
        <div className="card space-y-3 p-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-2 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="card"><ErrorState error={error} onRetry={() => refresh()} /></div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="activity"
            title="Nothing logged yet"
            description="Run a command, complete a task or write a note and it will show up in this timeline automatically."
          />
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([date, items]) => (
            <section key={date}>
              <div className="mb-2 flex items-center gap-3">
                <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">{dayLabel(date)}</h2>
                <div className="h-px flex-1 bg-line" />
                <span className="text-[11px] text-muted">{items.length} events</span>
              </div>
              <div className="card overflow-hidden">
                <ul className="divide-y divide-line-soft">
                  {items.map((a) => {
                    const meta = ACTIVITY_META[a.type] || ACTIVITY_META.system;
                    return (
                      <li key={a.id} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[#fafbfd]">
                        <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 ${meta.tone}`}>
                          <Icon name={TYPE_ICON[a.type] || 'info'} size={13} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-medium leading-snug text-ink">{a.title}</p>
                          {a.description && (
                            <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted">{a.description}</p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge className="bg-line-soft text-[10px] text-muted">{meta.label}</Badge>
                            {a.projectName && (
                              <Link
                                to={`/projects/${a.projectId}`}
                                className="chip text-[10.5px] transition-colors hover:text-brand-700"
                              >
                                {a.projectName}
                              </Link>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[10.5px] font-medium text-soft">{formatTime(a.createdAt || a.created_at)}</p>
                          <p className="text-[10px] text-muted">{relativeTime(a.createdAt || a.created_at)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          ))}

          {meta?.hasMore && (
            <div className="flex justify-center">
              <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + 80)} loading={loading}>
                Load more activity
              </Button>
            </div>
          )}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Log an activity entry"
        description="Record something that happened outside DevDeck — a call, a deploy, a decision."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={addEntry} loading={saving} disabled={!entry.title.trim()}>
              Add to timeline
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <div>
            <label className="field-label">What happened?</label>
            <input
              className="input"
              value={entry.title}
              onChange={(e) => setEntry({ ...entry, title: e.target.value })}
              placeholder="Deployed atlas-api v2.4.1 to staging"
              autoFocus
            />
          </div>
          <div>
            <label className="field-label">Details (optional)</label>
            <textarea
              className="input min-h-[70px] resize-y"
              value={entry.description}
              onChange={(e) => setEntry({ ...entry, description: e.target.value })}
              placeholder="Context worth remembering…"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Type</label>
              <Select
                value={entry.type}
                onChange={(v) => setEntry({ ...entry, type: v })}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'commit', label: 'Commit' },
                  { value: 'command', label: 'Command' },
                  { value: 'task', label: 'Task' },
                  { value: 'service', label: 'Service' },
                  { value: 'note', label: 'Note' },
                ]}
              />
            </div>
            <div>
              <label className="field-label">Project</label>
              <Select
                value={entry.projectId}
                onChange={(v) => setEntry({ ...entry, projectId: v })}
                options={[
                  { value: '', label: 'No project' },
                  ...(projects || []).map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
