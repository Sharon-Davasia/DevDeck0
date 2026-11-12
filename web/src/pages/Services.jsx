import { useMemo, useState } from 'react';
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
  Progress,
  Select,
  Skeleton,
  StatusDot,
  Tabs,
  Tooltip,
  useConfirm,
} from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { SERVICE_STATUS, formatUptime, relativeTime } from '../lib/format.js';

const EMPTY = { name: '', kind: 'docker', image: '', ports: '', projectId: '', status: 'running' };

export default function Services() {
  const toast = useToast();
  const confirm = useConfirm();
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [inspect, setInspect] = useState(null);

  const { data, meta, loading, error, refresh, setData } = useApi(
    `/services${qs({ status: statusFilter })}`,
    { deps: [statusFilter], initialData: [] }
  );
  const { data: projects } = useApi('/projects?status=all', { initialData: [] });
  const { data: docker } = useApi('/services/docker');

  useRealtime({
    'service:updated': (svc) => {
      setData((prev) => prev.map((s) => (s.id === svc.id ? { ...s, ...svc } : s)));
    },
  });

  const services = Array.isArray(data) ? data : [];
  const counts = useMemo(
    () => ({
      all: services.length,
      running: services.filter((s) => s.status === 'running').length,
      stopped: services.filter((s) => s.status === 'stopped').length,
      error: services.filter((s) => s.status === 'error').length,
    }),
    [services]
  );

  async function action(svc, kind) {
    if (kind === 'inspect') {
      try {
        const res = await api.post(`/services/${svc.id}/inspect`);
        setInspect({ service: svc, ...res.data });
      } catch (err) {
        toast.error(err.message);
      }
      return;
    }
    if (kind === 'stop' && svc.status === 'running') {
      const ok = await confirm({
        title: `Stop ${svc.name}?`,
        description: 'The service will be stopped on the host.',
        confirmLabel: 'Stop service',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setBusyId(svc.id);
    // Optimistic status flip
    const optimistic = kind === 'stop' ? 'stopped' : 'running';
    setData((prev) => prev.map((s) => (s.id === svc.id ? { ...s, status: optimistic } : s)));
    try {
      await api.post(`/services/${svc.id}/${kind}`);
      toast.success(
        `${svc.name} ${kind === 'start' ? 'started' : kind === 'stop' ? 'stopped' : 'restarted'}`,
        { description: docker?.connected ? undefined : 'Tracked state updated (no Docker daemon detected).' }
      );
      refresh({ silent: true });
    } catch (err) {
      toast.error(err.message);
      refresh({ silent: true });
    } finally {
      setBusyId(null);
    }
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    try {
      const res = await api.post('/services', {
        name: form.name.trim(),
        kind: form.kind,
        image: form.image.trim() || null,
        ports: form.ports.split(',').map((p) => p.trim()).filter(Boolean),
        projectId: form.projectId || null,
        status: form.status,
      });
      setData((prev) => [res.data, ...prev]);
      toast.success('Service tracked');
      setModalOpen(false);
      setForm(EMPTY);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(svc) {
    const ok = await confirm({ title: `Stop tracking ${svc.name}?`, confirmLabel: 'Remove service' });
    if (!ok) return;
    setData((prev) => prev.filter((s) => s.id !== svc.id));
    try {
      await api.del(`/services/${svc.id}`);
      toast.success('Service removed');
    } catch (err) {
      toast.error(err.message);
      refresh();
    }
  }

  return (
    <div>
      <PageHeader
        title="Services"
        subtitle="Containers and local processes running on your machine."
        actions={
          <Button variant="primary" size="sm" icon="plus" onClick={() => setModalOpen(true)}>
            Track service
          </Button>
        }
      />

      <div className="mb-3 flex items-center justify-between gap-3">
        <Tabs
          value={statusFilter}
          onChange={setStatusFilter}
          tabs={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'running', label: 'Running', count: counts.running },
            { value: 'stopped', label: 'Stopped', count: counts.stopped },
            { value: 'error', label: 'Errors', count: counts.error },
          ]}
        />
        <Tooltip label={docker?.message || 'Checking Docker…'}>
          <div
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
              docker?.connected
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-line bg-surface text-muted'
            }`}
          >
            <Icon name="docker" size={12} />
            {docker?.connected ? 'Docker connected' : 'Docker unreachable'}
          </div>
        </Tooltip>
      </div>

      {loading && !services.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-2 h-2.5 w-2/3" />
              <Skeleton className="mt-3 h-14 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="card"><ErrorState error={error} onRetry={() => refresh()} /></div>
      ) : services.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="server"
            title="No services tracked"
            description="Add a container or process to watch its status, ports and resource usage here."
            action={
              <Button size="sm" variant="primary" icon="plus" onClick={() => setModalOpen(true)}>
                Track your first service
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {services.map((svc) => {
            const s = SERVICE_STATUS[svc.status] || SERVICE_STATUS.stopped;
            return (
              <div key={svc.id} className="card card-hover flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span
                      className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ${s.className}`}
                    >
                      <Icon
                        name={svc.kind === 'database' ? 'database' : svc.kind === 'docker' ? 'docker' : 'server'}
                        size={14}
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-ink">{svc.name}</p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <StatusDot className={s.dot} pulse={svc.status === 'running'} />
                        <span className="text-[11px] font-medium text-soft">{s.label}</span>
                        {svc.projectName && (
                          <>
                            <span className="text-muted">·</span>
                            <span className="truncate text-[11px] text-muted">{svc.projectName}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <Tooltip label="Inspect">
                      <IconButton icon="eye" label="Inspect service" onClick={() => action(svc, 'inspect')} />
                    </Tooltip>
                    <Tooltip label="Remove">
                      <IconButton icon="trash" label="Remove service" onClick={() => remove(svc)} className="hover:text-red-600" />
                    </Tooltip>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 rounded-lg border border-line-soft bg-[#fbfcfe] px-2.5 py-2 font-mono text-[10.5px] text-muted">
                  {svc.image && (
                    <div className="flex justify-between gap-2">
                      <span>image</span>
                      <span className="truncate text-soft">{svc.image}</span>
                    </div>
                  )}
                  {svc.ports?.length > 0 && (
                    <div className="flex justify-between gap-2">
                      <span>ports</span>
                      <span className="truncate text-soft">{svc.ports.join(', ')}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <span>uptime</span>
                    <span className="text-soft">
                      {svc.status === 'running' ? formatUptime(svc.uptimeMs) : '—'}
                    </span>
                  </div>
                </div>

                {svc.status === 'running' && (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-[10.5px] text-muted">
                      <span className="flex items-center gap-1">
                        <Icon name="cpu" size={10} /> CPU
                      </span>
                      <span className="font-semibold tabular-nums text-soft">{svc.cpu.toFixed(1)}%</span>
                    </div>
                    <Progress value={svc.cpu} tone={svc.cpu > 80 ? 'bg-red-500' : 'bg-brand-500'} />
                    <div className="flex items-center justify-between pt-0.5 text-[10.5px] text-muted">
                      <span>Memory</span>
                      <span className="font-semibold tabular-nums text-soft">{Math.round(svc.memoryMb)} MB</span>
                    </div>
                  </div>
                )}

                <div className="mt-3 flex items-center gap-1.5 border-t border-line-soft pt-2.5">
                  {svc.status === 'running' ? (
                    <Button size="sm" variant="secondary" icon="stop" className="flex-1" disabled={busyId === svc.id} onClick={() => action(svc, 'stop')}>
                      Stop
                    </Button>
                  ) : (
                    <Button size="sm" variant="primary" icon="play" className="flex-1" disabled={busyId === svc.id} onClick={() => action(svc, 'start')}>
                      Start
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" icon="restart" disabled={busyId === svc.id} onClick={() => action(svc, 'restart')}>
                    Restart
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Track a service"
        description="Register a container or process so DevDeck can watch it."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={save} loading={saving} disabled={!form.name.trim()}>
              Track service
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
                placeholder="nova-ingest"
                autoFocus
              />
            </div>
            <div>
              <label className="field-label">Kind</label>
              <Select
                value={form.kind}
                onChange={(v) => setForm({ ...form, kind: v })}
                options={[
                  { value: 'docker', label: 'Docker container' },
                  { value: 'process', label: 'Local process' },
                  { value: 'database', label: 'Database' },
                  { value: 'tunnel', label: 'Tunnel' },
                ]}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Image (optional)</label>
              <input
                className="input font-mono text-[12.5px]"
                value={form.image}
                onChange={(e) => setForm({ ...form, image: e.target.value })}
                placeholder="redis:7.2-alpine"
              />
            </div>
            <div>
              <label className="field-label">Ports</label>
              <input
                className="input font-mono text-[12.5px]"
                value={form.ports}
                onChange={(e) => setForm({ ...form, ports: e.target.value })}
                placeholder="8080:8080, 5432:5432"
              />
            </div>
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
              <label className="field-label">Initial status</label>
              <Select
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v })}
                options={[
                  { value: 'running', label: 'Running' },
                  { value: 'stopped', label: 'Stopped' },
                ]}
              />
            </div>
          </div>
          {formError && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-700">{formError}</div>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(inspect)}
        onClose={() => setInspect(null)}
        title={inspect?.service?.name}
        description="Service inspection"
        size="md"
      >
        {inspect && (
          <div className="space-y-3">
            <div className="rounded-xl border border-line bg-[#fbfcfe] p-3">
              <dl className="space-y-1.5 text-[12px]">
                {[
                  ['Status', inspect.service.status],
                  ['Image', inspect.service.image || '—'],
                  ['Container ID', inspect.service.containerId ? `${inspect.service.containerId.slice(0, 12)}…` : '—'],
                  ['Ports', inspect.service.ports?.join(', ') || '—'],
                  ['CPU', `${inspect.service.cpu}%`],
                  ['Memory', `${Math.round(inspect.service.memoryMb)} MB`],
                  ['Started', inspect.service.startedAt ? relativeTime(inspect.service.startedAt) : '—'],
                  ['Docker daemon', inspect.docker ? 'connected' : 'unreachable'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted">{k}</dt>
                    <dd className="truncate font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {inspect.container && (
              <div className="rounded-xl border border-line p-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Live container</p>
                <pre className="overflow-x-auto font-mono text-[11px] text-soft">
                  {JSON.stringify(inspect.container, null, 2)}
                </pre>
              </div>
            )}
            {!inspect.docker && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
                <Icon name="info" size={13} className="mt-0.5 shrink-0" />
                Docker is not reachable from the DevDeck server, so this is the tracked state. Start Docker and refresh
                for live container data.
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
