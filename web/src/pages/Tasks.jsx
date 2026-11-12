import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { useApi, useDebounced, useLocalStorage } from '../lib/useApi.js';
import {
  Badge,
  Button,
  Dropdown,
  EmptyState,
  ErrorState,
  IconButton,
  MenuItem,
  Modal,
  SearchInput,
  Select,
  SkeletonRows,
  Tabs,
  Tooltip,
  useConfirm,
} from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { PRIORITY, STATUS, dueLabel, relativeTime } from '../lib/format.js';

const EMPTY = { title: '', description: '', priority: 'medium', status: 'todo', dueDate: '', projectId: '' };

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'today', label: 'Due today' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'done', label: 'Completed' },
];

export default function Tasks() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();

  const [filter, setFilter] = useState('open');
  const [projectId, setProjectId] = useState('');
  const [priority, setPriority] = useState('');
  const [sort, setSort] = useState('position');
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 220);
  const [selected, setSelected] = useState(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const firstRender = useRef(true);

  const { data: projects } = useApi('/projects?status=all', { initialData: [] });
  const { data: stats, refresh: refreshStats } = useApi('/tasks/stats');

  const queryString = useMemo(() => {
    const statusMap = {
      all: undefined,
      open: 'todo,in_progress,blocked',
      done: 'done',
    };
    return qs({
      status: statusMap[filter],
      due: filter === 'today' ? 'today' : filter === 'overdue' ? 'overdue' : undefined,
      projectId: projectId || undefined,
      priority: priority || undefined,
      sort: sort === 'position' ? undefined : sort,
      dir: sort === 'title' ? 'asc' : undefined,
      q: debounced || undefined,
      pageSize: 100,
    });
  }, [filter, projectId, priority, sort, debounced]);

  const { data, meta, loading, error, refresh, setData } = useApi(`/tasks${queryString}`, {
    deps: [queryString],
  });

  const tasks = Array.isArray(data) ? data : [];

  useEffect(() => {
    if (params.get('new') === '1') {
      openCreate();
      params.delete('new');
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSelected(new Set());
  }, [queryString]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY, projectId: projectId || projects?.[0]?.id || '' });
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(task) {
    setEditing(task);
    setForm({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
      projectId: task.projectId || '',
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function save(e) {
    e?.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    setFormError(null);
    const payload = {
      title: form.title.trim(),
      description: form.description,
      priority: form.priority,
      status: form.status,
      dueDate: form.dueDate ? new Date(`${form.dueDate}T17:00:00`).toISOString() : null,
      projectId: form.projectId || null,
    };
    try {
      if (editing) {
        const res = await api.patch(`/tasks/${editing.id}`, payload);
        setData((prev) => (prev || []).map((t) => (t.id === editing.id ? { ...t, ...res.data } : t)));
        toast.success('Task updated');
      } else {
        const res = await api.post('/tasks', payload);
        const project = projects.find((p) => p.id === payload.projectId);
        setData((prev) => [{ ...res.data, projectName: project?.name ?? null }, ...(prev || [])]);
        toast.success('Task created');
      }
      setModalOpen(false);
      refreshStats({ silent: true });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(task) {
    const next = task.status === 'done' ? 'todo' : 'done';
    setData((prev) =>
      (prev || []).map((t) =>
        t.id === task.id ? { ...t, status: next, completedAt: next === 'done' ? new Date().toISOString() : null } : t
      )
    );
    try {
      await api.patch(`/tasks/${task.id}`, { status: next });
      if (next === 'done') toast.success('Task completed', { description: task.title });
      refreshStats({ silent: true });
    } catch (err) {
      toast.error(err.message);
      refresh({ silent: true });
    }
  }

  async function updateStatus(task, status) {
    setData((prev) => (prev || []).map((t) => (t.id === task.id ? { ...t, status } : t)));
    try {
      await api.patch(`/tasks/${task.id}`, { status });
    } catch (err) {
      toast.error(err.message);
      refresh({ silent: true });
    }
  }

  async function remove(task) {
    const ok = await confirm({
      title: `Delete “${task.title}”?`,
      description: 'This task will be permanently removed.',
      confirmLabel: 'Delete task',
    });
    if (!ok) return;
    const snapshot = data;
    setData((prev) => (prev || []).filter((t) => t.id !== task.id));
    try {
      await api.del(`/tasks/${task.id}`);
      toast.success('Task deleted');
      refreshStats({ silent: true });
    } catch (err) {
      setData(snapshot);
      toast.error(err.message);
    }
  }

  async function bulk(action, value) {
    if (!selected.size) return;
    setBusy(true);
    const ids = [...selected];
    const snapshot = data;
    if (action === 'delete') {
      const ok = await confirm({
        title: `Delete ${ids.length} task${ids.length === 1 ? '' : 's'}?`,
        confirmLabel: 'Delete tasks',
      });
      if (!ok) {
        setBusy(false);
        return;
      }
      setData((prev) => (prev || []).filter((t) => !selected.has(t.id)));
    } else {
      setData((prev) => (prev || []).map((t) => (selected.has(t.id) ? { ...t, status: value } : t)));
    }
    try {
      await api.post('/tasks/bulk', {
        ids,
        ...(action === 'delete' ? { delete: true } : { status: value }),
      });
      toast.success(
        action === 'delete'
          ? `Deleted ${ids.length} task${ids.length === 1 ? '' : 's'}`
          : `Moved ${ids.length} task${ids.length === 1 ? '' : 's'} to ${STATUS[value]?.label}`
      );
      setSelected(new Set());
      refreshStats({ silent: true });
    } catch (err) {
      setData(snapshot);
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const allSelected = tasks.length > 0 && tasks.every((t) => selected.has(t.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(tasks.map((t) => t.id)));
  };

  const groups = useMemo(() => {
    if (sort !== 'position' && sort !== 'status') return null;
    const order = ['in_progress', 'todo', 'blocked', 'done'];
    return order
      .map((status) => ({ status, items: tasks.filter((t) => t.status === status) }))
      .filter((g) => g.items.length);
  }, [tasks, sort]);

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle={
          stats
            ? `${stats.total} total · ${stats.in_progress || 0} in progress · ${stats.due_today || 0} due today${
                stats.overdue ? ` · ${stats.overdue} overdue` : ''
              }`
            : 'Everything you need to do, across all projects.'
        }
        actions={
          <Button variant="primary" size="sm" icon="plus" onClick={openCreate}>
            New task
          </Button>
        }
      />

      {/* Toolbar */}
      <div className="mb-3 space-y-2.5">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
          <Tabs value={filter} onChange={setFilter} tabs={FILTERS.map((f) => ({ ...f, value: f.value }))} />
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
            <SearchInput value={query} onChange={setQuery} placeholder="Search tasks…" className="sm:w-52" />
            <div className="flex items-center gap-2">
              <Select
                value={projectId}
                onChange={setProjectId}
                size="sm"
                className="min-w-[132px]"
                options={[
                  { value: '', label: 'All projects' },
                  ...(projects || []).map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
              <Select
                value={priority}
                onChange={setPriority}
                size="sm"
                className="min-w-[110px]"
                options={[
                  { value: '', label: 'Any priority' },
                  { value: 'urgent', label: 'Urgent' },
                  { value: 'high', label: 'High' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'low', label: 'Low' },
                ]}
              />
              <Dropdown
                align="right"
                trigger={
                  <button className="btn-secondary btn-sm" aria-label="Sort tasks">
                    <Icon name="sliders" size={13} />
                    Sort
                  </button>
                }
              >
                <p className="px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted">Sort by</p>
                {[
                  { value: 'position', label: 'Manual order' },
                  { value: 'due_date', label: 'Due date' },
                  { value: 'priority', label: 'Priority' },
                  { value: 'created_at', label: 'Recently created' },
                  { value: 'title', label: 'Title (A–Z)' },
                ].map((o) => (
                  <MenuItem key={o.value} icon={sort === o.value ? 'check' : undefined} onClick={() => setSort(o.value)}>
                    {o.label}
                  </MenuItem>
                ))}
              </Dropdown>
            </div>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex animate-slide-down flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/70 px-3 py-2">
            <span className="text-[12px] font-semibold text-brand-800">
              {selected.size} selected
            </span>
            <div className="h-4 w-px bg-brand-200" />
            <Button size="sm" variant="secondary" icon="check-circle" disabled={busy} onClick={() => bulk('status', 'done')}>
              Mark done
            </Button>
            <Button size="sm" variant="secondary" icon="clock" disabled={busy} onClick={() => bulk('status', 'in_progress')}>
              In progress
            </Button>
            <Button size="sm" variant="secondary" icon="pause" disabled={busy} onClick={() => bulk('status', 'blocked')}>
              Blocked
            </Button>
            <Button size="sm" variant="secondary" icon="trash" className="text-red-600" disabled={busy} onClick={() => bulk('delete')}>
              Delete
            </Button>
            <button onClick={() => setSelected(new Set())} className="ml-auto text-[11.5px] font-medium text-brand-700 hover:underline">
              Clear
            </button>
          </div>
        )}
      </div>

      {/* List */}
      {loading && !data ? (
        <div className="card overflow-hidden">
          <SkeletonRows rows={8} cols={5} />
        </div>
      ) : error ? (
        <div className="card">
          <ErrorState error={error} onRetry={() => refresh()} />
        </div>
      ) : tasks.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={debounced ? 'search' : 'check-square'}
            title={
              debounced
                ? 'No tasks match those filters'
                : filter === 'done'
                  ? 'Nothing completed yet'
                  : filter === 'today'
                    ? 'Nothing due today'
                    : 'No tasks yet'
            }
            description={
              debounced
                ? 'Try clearing the search or widening the filters.'
                : 'Tasks keep the work visible. Add the first one and it will show up on your dashboard.'
            }
            action={
              debounced ? (
                <Button size="sm" variant="secondary" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              ) : (
                <Button size="sm" variant="primary" icon="plus" onClick={openCreate}>
                  New task
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-line-soft px-4 py-2">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-3.5 w-3.5 rounded border-[#cbd2dd] text-brand-600 focus:ring-brand-500"
              aria-label="Select all tasks"
            />
            <span className="text-[11px] font-medium text-muted">
              {meta?.total ?? tasks.length} task{meta?.total === 1 ? '' : 's'}
            </span>
            <span className="ml-auto text-[11px] text-muted">Click a task to edit</span>
          </div>

          {groups ? (
            groups.map((group) => (
              <div key={group.status}>
                <div className="flex items-center gap-2 border-b border-line-soft bg-[#fbfcfe] px-4 py-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS[group.status].dot}`} />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-soft">
                    {STATUS[group.status].label}
                  </span>
                  <span className="text-[11px] text-muted">{group.items.length}</span>
                </div>
                <ul className="divide-y divide-line-soft">
                  {group.items.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      selected={selected.has(task.id)}
                      onSelect={() => {
                        const next = new Set(selected);
                        next.has(task.id) ? next.delete(task.id) : next.add(task.id);
                        setSelected(next);
                      }}
                      onToggle={() => toggle(task)}
                      onEdit={() => openEdit(task)}
                      onDelete={() => remove(task)}
                      onStatus={(s) => updateStatus(task, s)}
                    />
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <ul className="divide-y divide-line-soft">
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  selected={selected.has(task.id)}
                  onSelect={() => {
                    const next = new Set(selected);
                    next.has(task.id) ? next.delete(task.id) : next.add(task.id);
                    setSelected(next);
                  }}
                  onToggle={() => toggle(task)}
                  onEdit={() => openEdit(task)}
                  onDelete={() => remove(task)}
                  onStatus={(s) => updateStatus(task, s)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit task' : 'New task'}
        description={editing ? 'Update the details below.' : 'Keep it small and specific.'}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={save} loading={saving} disabled={!form.title.trim()}>
              {editing ? 'Save changes' : 'Create task'}
            </Button>
          </>
        }
      >
        <form onSubmit={save} className="space-y-3.5">
          <div>
            <label className="field-label">Title</label>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Fix dropped frames in ingest worker"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="field-label">Description</label>
            <textarea
              className="input min-h-[80px] resize-y"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Context, acceptance criteria, links…"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Project</label>
              <Select
                value={form.projectId}
                onChange={(v) => setForm({ ...form, projectId: v })}
                options={[
                  { value: '', label: 'No project' },
                  ...(projects || []).map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </div>
            <div>
              <label className="field-label">Due date</label>
              <input
                type="date"
                className="input"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Priority</label>
              <div className="grid grid-cols-4 gap-1.5">
                {Object.entries(PRIORITY).map(([key, p]) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setForm({ ...form, priority: key })}
                    className={`rounded-lg border px-1.5 py-1.5 text-[11.5px] font-semibold transition-colors ${
                      form.priority === key
                        ? 'border-brand-400 bg-brand-50 text-brand-700'
                        : 'border-line text-muted hover:border-[#d8dce6] hover:text-soft'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="field-label">Status</label>
              <Select
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v })}
                options={Object.entries(STATUS).map(([v, s]) => ({ value: v, label: s.label }))}
              />
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

function TaskRow({ task, selected, onSelect, onToggle, onEdit, onDelete, onStatus }) {
  const priority = PRIORITY[task.priority] || PRIORITY.medium;
  const due = dueLabel(task.dueDate, task.status);
  const done = task.status === 'done';
  return (
    <li
      className={`group flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-[#fafbfd] ${
        selected ? 'bg-brand-50/40' : ''
      }`}
    >
      <div className="flex h-[18px] items-center gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          className="h-3.5 w-3.5 rounded border-[#cbd2dd] text-brand-600 focus:ring-brand-500"
          aria-label={`Select ${task.title}`}
        />
        <button
          onClick={onToggle}
          className={`grid h-[17px] w-[17px] place-items-center rounded-[5px] border-[1.5px] transition-all ${
            done
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : 'border-[#cfd5e0] text-transparent hover:border-brand-500 hover:text-brand-500'
          }`}
          aria-label={done ? 'Reopen task' : 'Complete task'}
        >
          <Icon name="check" size={10} strokeWidth={3} />
        </button>
      </div>

      <div className="min-w-0 flex-1 cursor-pointer" onClick={onEdit}>
        <div className="flex items-start gap-2">
          <p className={`min-w-0 flex-1 truncate text-[13px] ${done ? 'text-muted line-through' : 'font-medium text-ink'}`}>
            {task.title}
          </p>
          <Badge className={priority.className} dot={priority.dot}>
            {priority.label}
          </Badge>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted">
          {task.projectName && (
            <span className="flex items-center gap-1">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: task.projectColor || '#94a3b8' }}
              />
              {task.projectName}
            </span>
          )}
          {due && (
            <span
              className={`font-medium ${
                due.tone === 'danger' ? 'text-red-600' : due.tone === 'warning' ? 'text-amber-600' : ''
              }`}
            >
              {due.text}
            </span>
          )}
          {task.description && <span className="hidden truncate sm:inline">· {task.description.slice(0, 70)}</span>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {!done && task.status !== 'in_progress' && (
          <Tooltip label="Start">
            <IconButton icon="play" label="Start task" onClick={() => onStatus('in_progress')} />
          </Tooltip>
        )}
        <Tooltip label="Edit">
          <IconButton icon="edit" label="Edit task" onClick={onEdit} />
        </Tooltip>
        <Tooltip label="Delete">
          <IconButton icon="trash" label="Delete task" onClick={onDelete} className="hover:text-red-600" />
        </Tooltip>
      </div>
    </li>
  );
}
