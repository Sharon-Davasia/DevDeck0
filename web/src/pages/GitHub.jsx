import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  Modal,
  Select,
  Skeleton,
  Tabs,
  Tooltip,
  useConfirm,
} from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { formatDate, relativeTime } from '../lib/format.js';

export default function GitHub() {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState('repositories');
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [linkForm, setLinkForm] = useState({ fullName: '', projectId: '' });
  const [linking, setLinking] = useState(false);
  const [syncing, setSyncing] = useState(null);

  const { data: integration, meta: intMeta, refresh: refreshIntegration } = useApi('/github/integration');
  const { data: repos, loading, error, refresh, setData } = useApi('/github/repos', { initialData: [] });
  const { data: activity } = useApi('/github/activity?limit=20');
  const { data: projects } = useApi('/projects?status=all', { initialData: [] });

  const repoList = Array.isArray(repos) ? repos : [];

  async function connect() {
    if (!token.trim()) return;
    setConnecting(true);
    try {
      const res = await api.post('/github/integration', { token: token.trim() });
      toast.success(`Connected as @${res.data.account}`);
      setConnectOpen(false);
      setToken('');
      refreshIntegration();
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    const ok = await confirm({
      title: 'Disconnect GitHub?',
      description: 'Live repository data will stop syncing. Cached snapshots stay visible.',
      confirmLabel: 'Disconnect',
    });
    if (!ok) return;
    try {
      await api.del('/github/integration');
      toast.success('GitHub disconnected');
      refreshIntegration();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function linkRepo() {
    if (!linkForm.fullName.includes('/')) return;
    setLinking(true);
    try {
      const res = await api.post('/github/repos', {
        fullName: linkForm.fullName.trim(),
        projectId: linkForm.projectId || null,
      });
      setData((prev) => [res.data, ...prev.filter((r) => r.id !== res.data.id)]);
      toast.success('Repository linked', { description: res.data.fullName });
      setLinkOpen(false);
      setLinkForm({ fullName: '', projectId: '' });
      refresh({ silent: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLinking(false);
    }
  }

  async function sync(repo) {
    setSyncing(repo.id);
    try {
      const res = await api.post(`/github/repos/${repo.id}/sync`);
      setData((prev) => prev.map((r) => (r.id === repo.id ? res.data : r)));
      toast.success(
        res.meta?.live ? 'Synced from GitHub' : 'Snapshot refreshed',
        { description: res.meta?.live ? `${repo.fullName} updated` : 'Connect a token for live data.' }
      );
      refresh({ silent: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSyncing(null);
    }
  }

  async function unlink(repo) {
    const ok = await confirm({ title: `Unlink ${repo.fullName}?`, confirmLabel: 'Unlink repository' });
    if (!ok) return;
    setData((prev) => prev.filter((r) => r.id !== repo.id));
    try {
      await api.del(`/github/repos/${repo.id}`);
      toast.success('Repository unlinked');
    } catch (err) {
      toast.error(err.message);
      refresh();
    }
  }

  const commits = activity?.commits || [];
  const prs = activity?.pullRequests || [];
  const issues = activity?.issues || [];

  return (
    <div>
      <PageHeader
        title="GitHub"
        subtitle="Repositories linked to your projects, with commits, branches and pull requests."
        actions={
          <>
            <Button variant="secondary" size="sm" icon="link" onClick={() => setLinkOpen(true)}>
              Link repo
            </Button>
            {integration?.status === 'connected' ? (
              <Button variant="secondary" size="sm" icon="logout" onClick={disconnect}>
                Disconnect
              </Button>
            ) : (
              <Button variant="primary" size="sm" icon="git" onClick={() => setConnectOpen(true)}>
                Connect GitHub
              </Button>
            )}
          </>
        }
      />

      {/* Integration banner */}
      <div
        className={`mb-4 flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center ${
          integration?.status === 'connected'
            ? 'border-emerald-200 bg-emerald-50/60'
            : 'border-line bg-surface'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
              integration?.status === 'connected' ? 'bg-emerald-100 text-emerald-700' : 'bg-line-soft text-muted'
            }`}
          >
            <Icon name="git-branch" size={15} />
          </span>
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold text-ink">
              {integration?.status === 'connected'
                ? `Connected as @${integration.account}`
                : integration?.status === 'demo'
                  ? 'Demo snapshot — sample GitHub data'
                  : 'Not connected'}
            </p>
            <p className="truncate text-[11.5px] text-muted">
              {integration?.status === 'connected'
                ? 'Live commits, branches, PRs and issues sync on demand.'
                : integration?.status === 'demo'
                  ? 'Add a personal access token to pull live data from your own repositories.'
                  : 'Add a personal access token (read access is enough) to link real repositories.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <Badge className={integration?.status === 'connected' ? 'bg-emerald-100 text-emerald-700' : 'bg-line-soft text-muted'}>
            {integration?.status || 'disconnected'}
          </Badge>
          {integration?.status !== 'connected' && (
            <Button variant="primary" size="sm" icon="key" onClick={() => setConnectOpen(true)}>
              Add token
            </Button>
          )}
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-3 rounded-xl border border-line bg-canvas p-1"
        tabs={[
          { value: 'repositories', label: 'Repositories', icon: 'layers', count: repoList.length },
          { value: 'commits', label: 'Commits', icon: 'git-commit', count: commits.length },
          { value: 'pulls', label: 'Pull requests', icon: 'git-pull-request', count: prs.length },
          { value: 'issues', label: 'Issues', icon: 'alert-circle', count: issues.length },
        ]}
      />

      {tab === 'repositories' &&
        (loading && !repoList.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card p-4">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="mt-2 h-2.5 w-3/4" />
                <Skeleton className="mt-3 h-16 w-full rounded-lg" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="card"><ErrorState error={error} onRetry={() => refresh()} /></div>
        ) : repoList.length === 0 ? (
          <div className="card">
            <EmptyState
              icon="git-branch"
              title="No repositories linked"
              description="Link a GitHub repository to see its commits, branches and open work beside your project."
              action={
                <Button size="sm" variant="primary" icon="link" onClick={() => setLinkOpen(true)}>
                  Link a repository
                </Button>
              }
            />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {repoList.map((repo) => (
              <div key={repo.id} className="card card-hover flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#0f1420] text-white">
                      <Icon name="git" size={14} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-ink">{repo.fullName}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                        {repo.language && <span>{repo.language}</span>}
                        <span className="flex items-center gap-0.5">
                          <Icon name="star" size={10} /> {repo.stars}
                        </span>
                        {repo.projectName && (
                          <Link to={`/projects/${repo.projectId}`} className="chip text-[10px] hover:text-brand-700">
                            {repo.projectName}
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <Tooltip label="Unlink">
                      <IconButton icon="x" label="Unlink repository" onClick={() => unlink(repo)} />
                    </Tooltip>
                  </div>
                </div>

                <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-muted">
                  {repo.description || 'No description.'}
                </p>

                <div className="mt-2.5 grid grid-cols-3 gap-2 rounded-lg border border-line-soft bg-[#fbfcfe] p-2 text-center">
                  {[
                    { label: 'commits', value: (repo.data?.commits || []).length },
                    { label: 'branches', value: (repo.data?.branches || []).length },
                    { label: 'open PRs', value: repo.openPrs },
                  ].map((s) => (
                    <div key={s.label}>
                      <p className="text-[13px] font-bold tabular-nums text-ink">{s.value}</p>
                      <p className="text-[9.5px] uppercase tracking-wide text-muted">{s.label}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1">
                  {(repo.data?.branches || []).slice(0, 3).map((b) => (
                    <span key={b.name} className="chip font-mono text-[10px]">
                      <Icon name="git-branch" size={9} /> {b.name}
                    </span>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-line-soft pt-2.5">
                  <span className="text-[10.5px] text-muted">synced {relativeTime(repo.syncedAt)}</span>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => setSelectedRepo(repo)}>
                      Details
                    </Button>
                    <Button size="sm" variant="secondary" icon="refresh" loading={syncing === repo.id} onClick={() => sync(repo)}>
                      Sync
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

      {tab === 'commits' &&
        (commits.length === 0 ? (
          <div className="card">
            <EmptyState icon="git-commit" title="No commits synced" description="Link a repository and sync to pull recent commits." />
          </div>
        ) : (
          <div className="card divide-y divide-line-soft overflow-hidden">
            {commits.map((c, i) => (
              <div key={`${c.sha}-${i}`} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-violet-100">
                  <Icon name="git-commit" size={13} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium leading-snug text-ink">{c.message}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                    <span className="font-mono text-[10.5px]">{c.sha}</span>
                    <span>·</span>
                    <span>{c.author}</span>
                    <span>·</span>
                    <span>{relativeTime(c.date)}</span>
                    <span className="chip text-[10px]">{c.repo}</span>
                  </div>
                </div>
                {c.url && (
                  <a href={c.url} target="_blank" rel="noreferrer" className="btn-icon shrink-0">
                    <Icon name="external" size={13} />
                  </a>
                )}
              </div>
            ))}
          </div>
        ))}

      {tab === 'pulls' &&
        (prs.length === 0 ? (
          <div className="card">
            <EmptyState icon="git-pull-request" title="No open pull requests" description="Pull requests from linked repositories appear here." />
          </div>
        ) : (
          <div className="card divide-y divide-line-soft overflow-hidden">
            {prs.map((pr) => (
              <div key={`${pr.repo}-${pr.number}`} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                  <Icon name="git-pull-request" size={13} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-ink">
                    #{pr.number} · {pr.title}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                    <span>{pr.author}</span>
                    <span>·</span>
                    <span>{relativeTime(pr.updatedAt)}</span>
                    {pr.draft && <Badge className="bg-line-soft text-muted">draft</Badge>}
                    <span className="chip text-[10px]">{pr.repo}</span>
                  </div>
                </div>
                {pr.url && (
                  <a href={pr.url} target="_blank" rel="noreferrer" className="btn-icon shrink-0">
                    <Icon name="external" size={13} />
                  </a>
                )}
              </div>
            ))}
          </div>
        ))}

      {tab === 'issues' &&
        (issues.length === 0 ? (
          <div className="card">
            <EmptyState icon="alert-circle" title="No open issues" description="Issues from linked repositories appear here." />
          </div>
        ) : (
          <div className="card divide-y divide-line-soft overflow-hidden">
            {issues.map((issue) => (
              <div key={`${issue.repo}-${issue.number}`} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                  <Icon name="alert-circle" size={13} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-ink">
                    #{issue.number} · {issue.title}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                    <span>{issue.author}</span>
                    <span className="chip text-[10px]">{issue.repo}</span>
                    {(issue.labels || []).map((l) => (
                      <span key={l} className="badge bg-line-soft text-muted">{l}</span>
                    ))}
                  </div>
                </div>
                {issue.url && (
                  <a href={issue.url} target="_blank" rel="noreferrer" className="btn-icon shrink-0">
                    <Icon name="external" size={13} />
                  </a>
                )}
              </div>
            ))}
          </div>
        ))}

      {/* Connect modal */}
      <Modal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        title="Connect GitHub"
        description="DevDeck stores the token encrypted at rest (AES-256-GCM)."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConnectOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" icon="key" onClick={connect} loading={connecting} disabled={token.trim().length < 8}>
              Verify & connect
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="field-label">Personal access token</label>
            <input
              className="input font-mono text-[12.5px]"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxx"
              type="password"
              autoFocus
            />
            <p className="hint">
              Create a classic token with <code className="font-mono">repo</code> scope at{' '}
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-600 hover:underline"
              >
                github.com/settings/tokens
              </a>
              .
            </p>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-brand-50 px-3 py-2 text-[11.5px] text-brand-800">
            <Icon name="shield" size={13} className="mt-0.5 shrink-0" />
            <span>
              Tokens are encrypted with a key derived from your server secret and never returned by the API —
              only the connected account name is exposed.
            </span>
          </div>
        </div>
      </Modal>

      {/* Link repo modal */}
      <Modal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        title="Link a repository"
        description="Use the owner/repo format."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setLinkOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="link"
              onClick={linkRepo}
              loading={linking}
              disabled={!linkForm.fullName.includes('/')}
            >
              Link repository
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <div>
            <label className="field-label">Repository</label>
            <input
              className="input font-mono text-[12.5px]"
              value={linkForm.fullName}
              onChange={(e) => setLinkForm({ ...linkForm, fullName: e.target.value })}
              placeholder="novalabs/nova-analytics"
              autoFocus
            />
          </div>
          <div>
            <label className="field-label">Attach to project</label>
            <Select
              value={linkForm.projectId}
              onChange={(v) => setLinkForm({ ...linkForm, projectId: v })}
              options={[
                { value: '', label: 'No project' },
                ...(projects || []).map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </div>
        </div>
      </Modal>

      {/* Repo detail modal */}
      <Modal
        open={Boolean(selectedRepo)}
        onClose={() => setSelectedRepo(null)}
        title={selectedRepo?.fullName}
        description={selectedRepo?.description}
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setSelectedRepo(null)}>
              Close
            </Button>
            {selectedRepo && (
              <Button variant="primary" size="sm" icon="refresh" onClick={() => sync(selectedRepo)}>
                Sync now
              </Button>
            )}
          </>
        }
      >
        {selectedRepo && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: 'Language', value: selectedRepo.language || '—' },
                { label: 'Stars', value: selectedRepo.stars },
                { label: 'Open issues', value: selectedRepo.openIssues },
                { label: 'Open PRs', value: selectedRepo.openPrs },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-line p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted">{s.label}</p>
                  <p className="mt-0.5 text-[13px] font-semibold text-ink">{s.value}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Branches</p>
              <div className="flex flex-wrap gap-1">
                {(selectedRepo.data?.branches || []).map((b) => (
                  <span key={b.name} className="chip font-mono text-[10.5px]">
                    <Icon name="git-branch" size={9} /> {b.name}
                  </span>
                ))}
                {!selectedRepo.data?.branches?.length && <span className="text-[11.5px] text-muted">None synced</span>}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Contributors</p>
              <div className="flex flex-wrap gap-2">
                {(selectedRepo.data?.contributors || []).map((c) => (
                  <div key={c.login} className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1">
                    <Avatar name={c.login} size={18} color="#475569" />
                    <span className="text-[11.5px] font-medium text-soft">@{c.login}</span>
                    <span className="text-[10.5px] text-muted">{c.contributions}</span>
                  </div>
                ))}
                {!selectedRepo.data?.contributors?.length && <span className="text-[11.5px] text-muted">None synced</span>}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Recent commits</p>
              <ul className="space-y-1.5">
                {(selectedRepo.data?.commits || []).slice(0, 6).map((c) => (
                  <li key={c.sha} className="flex items-start gap-2 rounded-lg border border-line p-2">
                    <Icon name="git-commit" size={12} className="mt-0.5 shrink-0 text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11.5px] font-medium text-ink">{c.message}</p>
                      <p className="text-[10.5px] text-muted">
                        {c.author} · {formatDate(c.date)} · <span className="font-mono">{c.sha}</span>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
