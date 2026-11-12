import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { useApi, useDebounced } from '../lib/useApi.js';
import { useRealtime } from '../lib/realtime.js';
import {
  Badge,
  Button,
  CodeBlock,
  EmptyState,
  ErrorState,
  IconButton,
  Modal,
  SearchInput,
  Select,
  Skeleton,
  Spinner,
  Tabs,
  Tooltip,
  useConfirm,
} from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { RUN_STATUS, formatDuration, relativeTime } from '../lib/format.js';

const EMPTY = { name: '', description: '', command: '', cwd: '', tags: '', projectId: '', approved: false };

export default function Commands() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState(params.get('tab') === 'history' ? 'history' : 'library');
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 220);
  const [projectFilter, setProjectFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [policyCheck, setPolicyCheck] = useState(null);

  // Runner console state
  const [running, setRunning] = useState({ id: null, label: '', command: '', status: 'idle', output: '', startedAt: null });
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyStatus, setHistoryStatus] = useState('');
  const [activeRun, setActiveRun] = useState(null);
  const consoleRef = useRef(null);
  const pollRef = useRef(null);

  const { data: projects } = useApi('/projects?status=all', { initialData: [] });
  const { data, loading, error, refresh, setData } = useApi(
    `/commands${qs({ q: debounced, projectId: projectFilter || undefined })}`,
    { deps: [debounced, projectFilter], initialData: [] }
  );
  const { data: policy } = useApi('/commands/policy');
  const {
    data: runsData,
    meta: runsMeta,
    loading: runsLoading,
    refresh: refreshRuns,
  } = useApi(`/commands/runs${qs({ q: historyQuery, status: historyStatus || undefined, pageSize: 40 })}`, {
    deps: [historyQuery, historyStatus],
    skip: tab !== 'history',
    initialData: [],
  });

  const commands = Array.isArray(data) ? data : [];

  useRealtime({
    'command:output': (payload) => {
      if (payload.runId !== running.id) return;
      setRunning((prev) => (prev.id === payload.runId ? { ...prev, output: prev.output + payload.chunk } : prev));
    },
    'command:done': (payload) => {
      setRunning((prev) =>
        prev.id === payload.runId
          ? { ...prev, status: payload.status, exitCode: payload.exitCode, durationMs: payload.durationMs, output: payload.output ?? prev.output }
          : prev
      );
      refreshRuns({ silent: true });
    },
  });

  // Auto-scroll the console
  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [running.output]);

  // Deep link: ?run=<id>
  useEffect(() => {
    const runId = params.get('run');
    if (!runId) return;
    setTab('history');
    api
      .get(`/commands/runs/${runId}`)
      .then((res) => {
        setActiveRun(res.data);
        if (res.data.status === 'running') {
          setRunning({
            id: res.data.id,
            label: res.data.label,
            command: res.data.command,
            status: 'running',
            output: res.data.output || '',
            startedAt: res.data.startedAt,
          });
        }
      })
      .catch(() => {});
    params.delete('run');
    setParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll a running execution until it finishes (fallback when SSE is unavailable).
  useEffect(() => {
    clearInterval(pollRef.current);
    if (running.status !== 'running' || !running.id) return undefined;
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/commands/runs/${running.id}`);
        setRunning((prev) =>
          prev.id === res.data.id
            ? {
                ...prev,
                status: res.data.status,
                output: res.data.output || prev.output,
                exitCode: res.data.exitCode,
                durationMs: res.data.durationMs,
              }
            : prev
        );
        if (res.data.status !== 'running') refreshRuns({ silent: true });
      } catch {
        /* ignore */
      }
    }, 1200);
    return () => clearInterval(pollRef.current);
  }, [running.status, running.id, refreshRuns]);

  async function checkPolicy(command) {
    if (!command.trim()) {
      setPolicyCheck(null);
      return;
    }
    try {
      const res = await api.post('/commands/check', { command });
      setPolicyCheck(res.data);
    } catch {
      setPolicyCheck(null);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY, projectId: projectFilter || '' });
    setFormError(null);
    setPolicyCheck(null);
    setModalOpen(true);
  }

  function openEdit(cmd) {
    setEditing(cmd);
    setForm({
      name: cmd.name,
      description: cmd.description || '',
      command: cmd.command,
      cwd: cmd.cwd || '',
      tags: (cmd.tags || []).join(', '),
      projectId: cmd.projectId || '',
      approved: cmd.approved,
    });
    setFormError(null);
    checkPolicy(cmd.command);
    setModalOpen(true);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    const payload = {
      name: form.name.trim(),
      description: form.description,
      command: form.command.trim(),
      cwd: form.cwd.trim() || null,
      tags: form.tags.split(',').map((s) => s.trim()).filter(Boolean),
      projectId: form.projectId || null,
      approved: form.approved,
    };
    try {
      if (editing) {
        const res = await api.patch(`/commands/${editing.id}`, payload);
        setData((prev) => prev.map((c) => (c.id === editing.id ? res.data : c)));
        toast.success('Command updated');
      } else {
        const res = await api.post('/commands', payload);
        setData((prev) => [res.data, ...prev]);
        toast.success('Command saved', { description: res.data.name });
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(cmd) {
    const ok = await confirm({ title: `Delete “${cmd.name}”?`, confirmLabel: 'Delete command' });
    if (!ok) return;
    setData((prev) => prev.filter((c) => c.id !== cmd.id));
    try {
      await api.del(`/commands/${cmd.id}`);
      toast.success('Command deleted');
    } catch (err) {
      toast.error(err.message);
      refresh();
    }
  }

  async function run(cmd, { force = false } = {}) {
    try {
      const res = await api.post('/commands/run', { commandId: cmd.id, force });
      setRunning({
        id: res.data.id,
        label: res.data.label,
        command: res.data.command,
        status: 'running',
        output: '',
        startedAt: res.data.startedAt,
        exitCode: null,
        durationMs: null,
      });
      setTab('history');
      toast.info('Command started', { description: res.data.command, duration: 2500 });
    } catch (err) {
      if (err.status === 428) {
        const ok = await confirm({
          title: 'Dangerous command',
          description: 'DevDeck flagged this command. Review it before running.',
          body: (
            <div className="space-y-2.5">
              <CodeBlock code={cmd.command} />
              <p className="text-[12.5px] text-amber-700">
                {err.policy?.warnings?.join(' · ') || err.message}
              </p>
            </div>
          ),
          confirmLabel: 'Run anyway',
        });
        if (ok) run(cmd, { force: true });
        return;
      }
      toast.error(err.message, { description: err.policy?.reason });
    }
  }

  async function cancel() {
    if (!running.id) return;
    try {
      await api.post(`/commands/runs/${running.id}/cancel`);
      toast.warning('Cancelling command…');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function rerunFromHistory(run) {
    try {
      const res = await api.post('/commands/run', { command: run.command, cwd: run.cwd, projectId: run.projectId, label: run.label });
      setRunning({
        id: res.data.id,
        label: res.data.label,
        command: res.data.command,
        status: 'running',
        output: '',
        startedAt: res.data.startedAt,
      });
      toast.info('Re-running command');
    } catch (err) {
      toast.error(err.message);
    }
  }

  const stats = useMemo(() => {
    const total = commands.length;
    const approved = commands.filter((c) => c.approved).length;
    const flagged = commands.filter((c) => c.policy?.dangerous).length;
    return { total, approved, flagged };
  }, [commands]);

  return (
    <div>
      <PageHeader
        title="Commands"
        subtitle={
          policy
            ? `Allowlisted runner · ${formatDuration(policy.timeoutMs)} timeout · ${policy.requireAllowlist ? 'policy enforced' : 'policy relaxed'}`
            : 'Save the commands you run every day and execute them safely.'
        }
        actions={
          <Button variant="primary" size="sm" icon="plus" onClick={openCreate}>
            Save command
          </Button>
        }
      />

      <div className="mb-3 flex items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'library', label: 'Library', icon: 'terminal', count: stats.total },
            { value: 'history', label: 'History', icon: 'clock' },
          ]}
        />
        {tab === 'library' && (
          <div className="flex items-center gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Search commands…" className="w-44 sm:w-56" />
            <Select
              value={projectFilter}
              onChange={setProjectFilter}
              size="sm"
              className="hidden sm:block min-w-[130px]"
              options={[
                { value: '', label: 'All projects' },
                ...(projects || []).map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </div>
        )}
        {tab === 'history' && (
          <div className="flex items-center gap-2">
            <SearchInput value={historyQuery} onChange={setHistoryQuery} placeholder="Filter history…" className="w-44 sm:w-56" />
            <Select
              value={historyStatus}
              onChange={setHistoryStatus}
              size="sm"
              className="hidden sm:block min-w-[110px]"
              options={[
                { value: '', label: 'Any status' },
                { value: 'success', label: 'Success' },
                { value: 'failed', label: 'Failed' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
            />
          </div>
        )}
      </div>

      {tab === 'library' ? (
        loading && !commands.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card p-4">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="mt-2 h-2.5 w-2/3" />
                <Skeleton className="mt-3 h-16 w-full rounded-lg" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="card"><ErrorState error={error} onRetry={() => refresh()} /></div>
        ) : commands.length === 0 ? (
          <div className="card">
            <EmptyState
              icon="terminal"
              title={query ? 'No commands match' : 'Your command library is empty'}
              description={
                query
                  ? 'Try another search term.'
                  : 'Save a command once — with its working directory, tags and project — then run it from here with live output.'
              }
              action={
                <Button size="sm" variant="primary" icon="plus" onClick={openCreate}>
                  Save your first command
                </Button>
              }
            />
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {commands.map((cmd) => (
              <CommandCard key={cmd.id} cmd={cmd} onRun={() => run(cmd)} onEdit={() => openEdit(cmd)} onDelete={() => remove(cmd)} />
            ))}
          </div>
        )
      ) : (
        <HistoryView
          runs={Array.isArray(runsData) ? runsData : []}
          meta={runsMeta}
          loading={runsLoading && !runsData?.length}
          running={running}
          consoleRef={consoleRef}
          onCancel={cancel}
          onClose={() => setRunning({ id: null, status: 'idle', output: '', label: '', command: '' })}
          onInspect={async (run) => {
            try {
              const res = await api.get(`/commands/runs/${run.id}`);
              setActiveRun(res.data);
            } catch (err) {
              toast.error(err.message);
            }
          }}
          onRerun={rerunFromHistory}
        />
      )}

      <RunInspector run={activeRun} onClose={() => setActiveRun(null)} onRerun={rerunFromHistory} />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit command' : 'Save a command'}
        description="Commands run through the allowlisted process runner."
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={save}
              loading={saving}
              disabled={!form.name.trim() || !form.command.trim() || (policyCheck && !policyCheck.allowed)}
            >
              {editing ? 'Save changes' : 'Save command'}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Name</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Start dev server"
                autoFocus
              />
            </div>
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
          </div>
          <div>
            <label className="field-label">Command</label>
            <textarea
              className="input min-h-[64px] resize-y font-mono text-[12.5px]"
              value={form.command}
              onChange={(e) => {
                setForm({ ...form, command: e.target.value });
                checkPolicy(e.target.value);
              }}
              placeholder="npm run dev"
              spellCheck={false}
            />
            {policyCheck && (
              <div
                className={`mt-1.5 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] ${
                  !policyCheck.allowed
                    ? 'bg-red-50 text-red-700'
                    : policyCheck.dangerous
                      ? 'bg-amber-50 text-amber-800'
                      : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                <Icon
                  name={!policyCheck.allowed ? 'alert-triangle' : policyCheck.dangerous ? 'alert-circle' : 'check-circle'}
                  size={13}
                  className="mt-0.5 shrink-0"
                />
                <span>
                  {!policyCheck.allowed
                    ? policyCheck.reason
                    : policyCheck.dangerous
                      ? `Flagged as dangerous: ${policyCheck.warnings.join(', ')}. You will be asked to confirm before each run.`
                      : 'Allowed by policy'}
                </span>
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Working directory</label>
              <input
                className="input font-mono text-[12.5px]"
                value={form.cwd}
                onChange={(e) => setForm({ ...form, cwd: e.target.value })}
                placeholder="~/dev/project"
              />
            </div>
            <div>
              <label className="field-label">Tags</label>
              <input
                className="input"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="docker, test, dev"
              />
            </div>
          </div>
          <div>
            <label className="field-label">Description</label>
            <input
              className="input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What does this do?"
            />
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-[#fbfcfe] p-3">
            <input
              type="checkbox"
              checked={form.approved}
              onChange={(e) => setForm({ ...form, approved: e.target.checked })}
              className="mt-0.5 h-3.5 w-3.5 rounded border-[#cbd2dd] text-brand-600 focus:ring-brand-500"
            />
            <span>
              <span className="block text-[12.5px] font-semibold text-ink">Pre-approve this command</span>
              <span className="block text-[11.5px] text-muted">
                Approved commands appear first in the library. Dangerous commands still require confirmation.
              </span>
            </span>
          </label>
          {formError && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-700">{formError}</div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function CommandCard({ cmd, onRun, onEdit, onDelete }) {
  const flagged = cmd.policy?.dangerous;
  const blocked = cmd.policy && !cmd.policy.allowed;
  return (
    <div className="card card-hover flex flex-col p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-[13px] font-semibold text-ink">{cmd.name}</h3>
            {cmd.approved && <Badge className="bg-emerald-50 text-emerald-700">approved</Badge>}
            {flagged && !blocked && <Badge className="bg-amber-50 text-amber-700" icon="alert-triangle">dangerous</Badge>}
            {blocked && <Badge className="bg-red-50 text-red-700" icon="shield">blocked</Badge>}
          </div>
          {cmd.description && <p className="mt-0.5 line-clamp-1 text-[11.5px] text-muted">{cmd.description}</p>}
        </div>
        <div className="flex shrink-0 items-center">
          <Tooltip label="Edit">
            <IconButton icon="edit" label="Edit command" onClick={onEdit} />
          </Tooltip>
          <Tooltip label="Delete">
            <IconButton icon="trash" label="Delete command" onClick={onDelete} className="hover:text-red-600" />
          </Tooltip>
        </div>
      </div>

      <div className="mt-2.5">
        <CodeBlock code={cmd.command} copyable maxHeight={96} />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {cmd.projectName && (
          <span className="chip">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: cmd.projectColor }} />
            {cmd.projectName}
          </span>
        )}
        {(cmd.tags || []).slice(0, 3).map((t) => (
          <span key={t} className="chip">#{t}</span>
        ))}
        {cmd.cwd && (
          <span className="chip font-mono text-[10.5px]">
            <Icon name="folder" size={10} /> {cmd.cwd}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-line-soft pt-2.5">
        <span className="text-[10.5px] text-muted">
          {cmd.runCount > 0 ? `Run ${cmd.runCount}× · ${relativeTime(cmd.lastRunAt)}` : 'Never run'}
        </span>
        <Button variant="primary" size="sm" icon="play" onClick={onRun} disabled={blocked}>
          Run
        </Button>
      </div>
    </div>
  );
}

function HistoryView({ runs, loading, running, consoleRef, onCancel, onClose, onInspect, onRerun, meta }) {
  return (
    <div className="grid gap-3 xl:grid-cols-5">
      <div className={`card overflow-hidden ${running.status !== 'idle' ? 'xl:col-span-2' : 'xl:col-span-5'}`}>
        <div className="flex items-center justify-between border-b border-line-soft px-4 py-2.5">
          <div>
            <h3 className="section-title">Execution history</h3>
            <p className="meta">{meta?.total ?? runs.length} recorded runs</p>
          </div>
          <Badge className="bg-line-soft text-muted" icon="shield">
            allowlisted
          </Badge>
        </div>
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <EmptyState icon="clock" title="No runs yet" description="Execute a command from the library to see its output here." compact />
        ) : (
          <ul className="max-h-[70vh] divide-y divide-line-soft overflow-y-auto">
            {runs.map((run) => {
              const s = RUN_STATUS[run.status] || RUN_STATUS.running;
              return (
                <li
                  key={run.id}
                  className={`cursor-pointer px-4 py-2.5 transition-colors hover:bg-[#fafbfd] ${
                    running.id === run.id ? 'bg-brand-50/50' : ''
                  }`}
                  onClick={() => onInspect(run)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-ink">{run.label || run.command}</p>
                      <p className="truncate font-mono text-[10.5px] text-muted">{run.command}</p>
                    </div>
                    <Badge className={`shrink-0 ${s.className}`}>{s.label}</Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-2.5 text-[10.5px] text-muted">
                    <span>{relativeTime(run.startedAt)}</span>
                    <span className="font-mono">{formatDuration(run.durationMs)}</span>
                    {run.exitCode !== null && run.exitCode !== undefined && (
                      <span className={`font-mono ${run.exitCode === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        exit {run.exitCode}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRerun(run);
                      }}
                      className="ml-auto flex items-center gap-1 font-medium text-brand-600 hover:underline"
                    >
                      <Icon name="refresh" size={10} /> re-run
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {running.status !== 'idle' && (
        <div className="card flex min-h-[320px] flex-col overflow-hidden xl:col-span-3">
          <div className="flex items-center justify-between gap-2 border-b border-line-soft px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              {running.status === 'running' ? (
                <Spinner size={13} className="text-brand-600" />
              ) : (
                <span
                  className={`h-2 w-2 rounded-full ${
                    running.status === 'success' ? 'bg-emerald-500' : running.status === 'failed' ? 'bg-red-500' : 'bg-amber-500'
                  }`}
                />
              )}
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-semibold text-ink">{running.label || 'Console'}</p>
                <p className="truncate font-mono text-[10.5px] text-muted">{running.command}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {running.status === 'running' ? (
                <Button size="sm" variant="danger" icon="stop" onClick={onCancel}>
                  Cancel
                </Button>
              ) : (
                <Button size="sm" variant="secondary" icon="x" onClick={onClose}>
                  Close
                </Button>
              )}
            </div>
          </div>
          <div
            ref={consoleRef}
            className="flex-1 overflow-auto bg-[#0f1420] p-3.5 font-mono text-[12px] leading-[1.7] text-slate-200"
          >
            {running.output ? (
              <pre className="whitespace-pre-wrap break-words">{running.output}</pre>
            ) : (
              <div className="flex items-center gap-2 text-slate-500">
                {running.status === 'running' ? (
                  <>
                    <Spinner size={12} /> Waiting for output…
                  </>
                ) : (
                  'No output captured.'
                )}
              </div>
            )}
            {running.status === 'running' && <span className="inline-block h-3.5 w-1.5 animate-pulse bg-slate-400 align-middle" />}
          </div>
          <div className="flex items-center gap-3 border-t border-line-soft px-4 py-2 text-[11px] text-muted">
            <span className="flex items-center gap-1">
              <Icon name="clock" size={11} /> {formatDuration(running.durationMs)}
            </span>
            {running.exitCode !== null && running.exitCode !== undefined && (
              <span className={`font-mono ${running.exitCode === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                exit {running.exitCode}
              </span>
            )}
            <span className="ml-auto font-mono text-[10px] text-muted/80">utf-8 · capped output</span>
          </div>
        </div>
      )}
    </div>
  );
}

function RunInspector({ run, onClose, onRerun }) {
  if (!run) return null;
  const s = RUN_STATUS[run.status] || RUN_STATUS.running;
  return (
    <Modal
      open={Boolean(run)}
      onClose={onClose}
      title={run.label || 'Command run'}
      description={run.command}
      size="lg"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" size="sm" icon="refresh" onClick={() => onRerun(run)}>
            Re-run
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge className={s.className}>{s.label}</Badge>
        <span className="chip font-mono">exit {run.exitCode ?? '—'}</span>
        <span className="chip">{formatDuration(run.durationMs)}</span>
        <span className="chip">{relativeTime(run.startedAt)}</span>
        {run.cwd && <span className="chip font-mono">{run.cwd}</span>}
      </div>
      <CodeBlock code={run.output || 'No output captured.'} language="output" maxHeight={380} />
    </Modal>
  );
}
