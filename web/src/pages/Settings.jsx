import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useAuth } from '../lib/AuthContext.jsx';
import {
  Avatar,
  Badge,
  Button,
  CodeBlock,
  Modal,
  Select,
  Skeleton,
  StatusDot,
  Tabs,
  useConfirm,
} from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { formatDuration } from '../lib/format.js';

const TABS = [
  { value: 'profile', label: 'Profile', icon: 'user' },
  { value: 'security', label: 'Security', icon: 'lock' },
  { value: 'appearance', label: 'Appearance', icon: 'sparkles' },
  { value: 'execution', label: 'Command execution', icon: 'terminal' },
  { value: 'integrations', label: 'Integrations', icon: 'link' },
  { value: 'data', label: 'Data', icon: 'database' },
];

export default function Settings() {
  const { user, updateUser, logout } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [tab, setTab] = useState('profile');

  const { data: settings, loading, refresh } = useApi('/settings');
  const { data: projects } = useApi('/projects?status=all', { initialData: [] });
  const { data: policy } = useApi('/commands/policy');

  const [profile, setProfile] = useState({ name: '', email: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [savingPassword, setSavingPassword] = useState(false);
  const [ghToken, setGhToken] = useState('');
  const [savingGh, setSavingGh] = useState(false);
  const [testingDocker, setTestingDocker] = useState(false);
  const [dockerResult, setDockerResult] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (user) setProfile({ name: user.name, email: user.email });
  }, [user]);

  const prefs = user?.prefs || {};

  async function savePrefs(patch) {
    const next = { ...prefs, ...patch };
    updateUser({ prefs: next });
    try {
      await api.patch('/settings/prefs', { prefs: patch });
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const res = await api.patch('/auth/me', { name: profile.name.trim(), email: profile.email.trim() });
      updateUser(res.user);
      toast.success('Profile updated');
      refresh({ silent: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword() {
    if (password.newPassword !== password.confirm) {
      toast.error('New passwords do not match');
      return;
    }
    if (password.newPassword.length < 8) {
      toast.error('Use at least 8 characters');
      return;
    }
    setSavingPassword(true);
    try {
      await api.post('/auth/me/password', {
        currentPassword: password.currentPassword,
        newPassword: password.newPassword,
      });
      toast.success('Password changed');
      setPassword({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingPassword(false);
    }
  }

  async function setTheme(theme) {
    updateUser({ theme });
    try {
      await api.patch('/auth/me', { theme });
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function saveDefaultProject(id) {
    updateUser({ defaultProjectId: id || null });
    try {
      await api.patch('/auth/me', { defaultProjectId: id || null });
      toast.success('Default project updated');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function exportData() {
    try {
      const res = await fetch('/api/settings/export', {
        headers: { Authorization: `Bearer ${localStorage.getItem('devdeck.token')}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `devdeck-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Workspace exported');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function importData(file) {
    setImporting(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await api.post('/settings/import', json);
      const summary = Object.entries(res.data)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${v} ${k}`)
        .join(', ');
      toast.success('Import complete', { description: summary || 'Nothing new to import' });
      refresh({ silent: true });
    } catch (err) {
      toast.error(err.message || 'That file could not be imported');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function resetWorkspace() {
    try {
      await api.post('/settings/reset');
      toast.success('Workspace cleared');
      setResetOpen(false);
      refresh({ silent: true });
      navigate('/');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function connectGithub() {
    if (!ghToken.trim()) return;
    setSavingGh(true);
    try {
      const res = await api.post('/github/integration', { token: ghToken.trim() });
      toast.success(`Connected as @${res.data.account}`);
      setGhToken('');
      refresh({ silent: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingGh(false);
    }
  }

  async function disconnectGithub() {
    try {
      await api.del('/github/integration');
      toast.success('GitHub disconnected');
      refresh({ silent: true });
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function testDocker() {
    setTestingDocker(true);
    try {
      const res = await api.get('/services/docker');
      setDockerResult(res.data);
      if (res.data.connected) toast.success('Docker daemon reachable');
      else toast.warning('Docker daemon unreachable', { description: res.data.message });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTestingDocker(false);
    }
  }

  if (loading && !settings) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Profile, security, execution policy, integrations and data." />

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Sidebar tabs */}
        <nav className="flex shrink-0 gap-1 overflow-x-auto no-scrollbar lg:w-52 lg:flex-col">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-2.5 py-2 text-[12.5px] font-medium transition-colors ${
                tab === t.value ? 'bg-surface text-ink shadow-card ring-1 ring-line' : 'text-muted hover:text-ink'
              }`}
            >
              <Icon name={t.icon} size={14} />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-4">
          {tab === 'profile' && (
            <>
              <section className="card p-5">
                <div className="flex items-center gap-3.5">
                  <Avatar name={user?.name} color={user?.avatarColor} size={52} />
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-ink">{user?.name}</p>
                    <p className="text-[12px] text-muted">{user?.email}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Badge className="bg-brand-50 text-brand-700">Personal workspace</Badge>
                      <Badge className="bg-line-soft text-muted">
                        joined {new Date(user?.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </Badge>
                    </div>
                  </div>
                </div>
              </section>

              <section className="card p-5">
                <h2 className="section-title">Profile details</h2>
                <p className="meta mb-4">This is how you appear inside DevDeck.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="field-label">Full name</label>
                    <input
                      className="input"
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="field-label">Email</label>
                    <input
                      className="input"
                      type="email"
                      value={profile.email}
                      onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="field-label">Default project</label>
                  <Select
                    value={user?.defaultProjectId || ''}
                    onChange={saveDefaultProject}
                    options={[
                      { value: '', label: 'No default — open the dashboard' },
                      ...(projects || []).map((p) => ({ value: p.id, label: p.name })),
                    ]}
                  />
                  <p className="hint">Used when creating tasks, notes and commands without an explicit project.</p>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    icon="save"
                    onClick={saveProfile}
                    loading={savingProfile}
                    disabled={!profile.name.trim() || !profile.email.trim()}
                  >
                    Save profile
                  </Button>
                </div>
              </section>

              <section className="card p-5">
                <h2 className="section-title">Workspace at a glance</h2>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: 'Projects', value: settings?.counts?.projects, icon: 'folder' },
                    { label: 'Tasks', value: settings?.counts?.tasks, icon: 'check-square' },
                    { label: 'Notes', value: settings?.counts?.notes, icon: 'note' },
                    { label: 'Command runs', value: settings?.counts?.commands, icon: 'terminal' },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border border-line p-3">
                      <Icon name={s.icon} size={13} className="text-muted" />
                      <p className="mt-1.5 text-[18px] font-bold tabular-nums text-ink">{s.value ?? 0}</p>
                      <p className="text-[11px] text-muted">{s.label}</p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {tab === 'security' && (
            <>
              <section className="card p-5">
                <h2 className="section-title">Change password</h2>
                <p className="meta mb-4">
                  Passwords are hashed with bcrypt. Sessions use signed JWTs and stay valid until they expire.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="field-label">Current password</label>
                    <input
                      className="input"
                      type="password"
                      value={password.currentPassword}
                      onChange={(e) => setPassword({ ...password, currentPassword: e.target.value })}
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="field-label">New password</label>
                      <input
                        className="input"
                        type="password"
                        value={password.newPassword}
                        onChange={(e) => setPassword({ ...password, newPassword: e.target.value })}
                        autoComplete="new-password"
                      />
                    </div>
                    <div>
                      <label className="field-label">Confirm new password</label>
                      <input
                        className="input"
                        type="password"
                        value={password.confirm}
                        onChange={(e) => setPassword({ ...password, confirm: e.target.value })}
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    icon="key"
                    onClick={changePassword}
                    loading={savingPassword}
                    disabled={!password.currentPassword || password.newPassword.length < 8}
                  >
                    Update password
                  </Button>
                </div>
              </section>

              <section className="card p-5">
                <h2 className="section-title">Session security</h2>
                <ul className="mt-3 space-y-2 text-[12.5px] text-soft">
                  {[
                    ['bcrypt password hashing', 'Credentials never stored in plaintext'],
                    ['JWT bearer sessions', 'Signed tokens, 7 day expiry, verified on every request'],
                    ['Per-user query isolation', 'Every SQL statement is scoped by user_id'],
                    ['Encrypted third-party secrets', 'GitHub tokens encrypted with AES-256-GCM'],
                  ].map(([title, desc]) => (
                    <li key={title} className="flex items-start gap-2">
                      <Icon name="check-circle" size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                      <span>
                        <span className="font-semibold text-ink">{title}</span>
                        <span className="text-muted"> — {desc}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex items-center justify-between rounded-xl border border-red-100 bg-red-50/50 p-3">
                  <div>
                    <p className="text-[12.5px] font-semibold text-ink">Sign out everywhere</p>
                    <p className="text-[11.5px] text-muted">Ends this session and clears the stored token.</p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    icon="logout"
                    onClick={() => {
                      logout();
                      navigate('/login');
                    }}
                  >
                    Sign out
                  </Button>
                </div>
              </section>
            </>
          )}

          {tab === 'appearance' && (
            <section className="card p-5">
              <h2 className="section-title">Theme</h2>
              <p className="meta mb-4">DevDeck is light-first, with a full dark theme.</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  { value: 'light', label: 'Light', desc: 'Clean, bright surfaces' },
                  { value: 'dark', label: 'Dark', desc: 'Low-glare for night work' },
                  { value: 'system', label: 'System', desc: 'Follow your OS setting' },
                ].map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTheme(t.value)}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      (user?.theme || 'light') === t.value
                        ? 'border-brand-400 bg-brand-50/60 ring-1 ring-brand-200'
                        : 'border-line hover:border-[#d8dce6]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[12.5px] font-semibold text-ink">{t.label}</span>
                      {(user?.theme || 'light') === t.value && (
                        <Icon name="check-circle" size={14} className="text-brand-600" />
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted">{t.desc}</p>
                    <div
                      className={`mt-2 h-10 rounded-lg border ${
                        t.value === 'dark'
                          ? 'border-[#262c3a] bg-[#0d1017]'
                          : t.value === 'system'
                            ? 'border-line bg-gradient-to-r from-white to-[#0d1017]'
                            : 'border-line bg-white'
                      }`}
                    >
                      <div className="flex h-full items-center gap-1 p-1.5">
                        <span
                          className={`h-full w-2 rounded ${
                            t.value === 'dark' ? 'bg-[#1a1f2b]' : 'bg-[#f1f2f6]'
                          }`}
                        />
                        <span className="h-full flex-1 rounded bg-brand-500/70" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-5 border-t border-line-soft pt-4">
                <h3 className="text-[12.5px] font-semibold text-ink">Editor defaults</h3>
                <div className="mt-2 flex items-center justify-between rounded-xl border border-line p-3">
                  <div>
                    <p className="text-[12.5px] font-medium text-ink">Notes open in preview mode</p>
                    <p className="text-[11.5px] text-muted">Show rendered markdown first instead of the raw editor.</p>
                  </div>
                  <Toggle
                    checked={prefs.notesPreviewFirst !== false}
                    onChange={(v) => savePrefs({ notesPreviewFirst: v })}
                  />
                </div>
              </div>
            </section>
          )}

          {tab === 'execution' && (
            <>
              <section className="card p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="section-title">Command execution policy</h2>
                    <p className="meta">Server-side controls applied to every run.</p>
                  </div>
                  <Badge className={policy?.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}>
                    {policy?.enabled ? 'enabled' : 'disabled'}
                  </Badge>
                </div>
                <dl className="mt-4 grid gap-2 sm:grid-cols-2">
                  {[
                    ['Timeout', policy ? formatDuration(policy.timeoutMs) : '—'],
                    ['Output cap', policy ? `${Math.round(policy.maxOutputBytes / 1024)} KB` : '—'],
                    ['Allowlist', policy?.requireAllowlist ? 'enforced' : 'relaxed'],
                    ['Allowed binaries', `${policy?.allowlist?.length ?? 0} commands`],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-line p-3">
                      <dt className="text-[10.5px] uppercase tracking-wide text-muted">{k}</dt>
                      <dd className="mt-0.5 text-[13px] font-semibold text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="card p-5">
                <h2 className="section-title">Preferences</h2>
                <div className="mt-3 space-y-2">
                  <ToggleRow
                    title="Confirm dangerous commands"
                    description="Ask for explicit confirmation when a command matches a risky pattern (rm -rf, git push, prune…)."
                    checked={prefs.confirmDangerous !== false}
                    onChange={(v) => savePrefs({ confirmDangerous: v })}
                  />
                  <ToggleRow
                    title="Show full command output"
                    description="Render the entire captured output instead of the truncated console view."
                    checked={prefs.fullOutput === true}
                    onChange={(v) => savePrefs({ fullOutput: v })}
                  />
                  <ToggleRow
                    title="Auto-scroll console"
                    description="Keep the output console pinned to the newest line while a command runs."
                    checked={prefs.autoScroll !== false}
                    onChange={(v) => savePrefs({ autoScroll: v })}
                  />
                </div>
              </section>

              <section className="card p-5">
                <h2 className="section-title">Allowlisted binaries</h2>
                <p className="meta mb-3">
                  Commands are executed with <code className="font-mono text-[11.5px]">/bin/sh -c</code> after policy
                  checks. Segments joined with <code className="font-mono text-[11.5px]">&amp;&amp;</code>,{' '}
                  <code className="font-mono text-[11.5px]">|</code> or <code className="font-mono text-[11.5px]">;</code>{' '}
                  must each start with an allowed binary.
                </p>
                <div className="flex flex-wrap gap-1">
                  {(policy?.allowlist || []).map((b) => (
                    <span key={b} className="chip font-mono text-[10.5px]">{b}</span>
                  ))}
                </div>
              </section>
            </>
          )}

          {tab === 'integrations' && (
            <>
              <section className="card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#0f1420] text-white">
                      <Icon name="git" size={16} />
                    </span>
                    <div>
                      <h2 className="section-title">GitHub</h2>
                      <p className="meta">
                        {settings?.github?.status === 'connected'
                          ? `Connected as @${settings.github.account}`
                          : settings?.github?.status === 'demo'
                            ? 'Demo data active (no token)'
                            : 'Not connected'}
                      </p>
                    </div>
                  </div>
                  <Badge
                    className={
                      settings?.github?.status === 'connected'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-line-soft text-muted'
                    }
                  >
                    {settings?.github?.status || 'disconnected'}
                  </Badge>
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input
                    className="input flex-1 font-mono text-[12.5px]"
                    type="password"
                    value={ghToken}
                    onChange={(e) => setGhToken(e.target.value)}
                    placeholder="ghp_… personal access token"
                  />
                  <Button variant="primary" size="sm" icon="key" onClick={connectGithub} loading={savingGh} disabled={ghToken.trim().length < 8}>
                    Save token
                  </Button>
                  {settings?.github?.status === 'connected' && (
                    <Button variant="secondary" size="sm" onClick={disconnectGithub}>
                      Disconnect
                    </Button>
                  )}
                </div>
                <p className="hint">Stored encrypted (AES-256-GCM) and never returned by the API.</p>
              </section>

              <section className="card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                      <Icon name="docker" size={16} />
                    </span>
                    <div>
                      <h2 className="section-title">Docker</h2>
                      <p className="meta font-mono text-[11px]">{settings?.docker?.host}</p>
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5">
                    <StatusDot
                      className={dockerResult?.connected ?? settings?.docker?.connected ? 'bg-emerald-500' : 'bg-slate-400'}
                    />
                    <span className="text-[10.5px] font-semibold text-muted">
                      {dockerResult?.connected ?? settings?.docker?.connected ? 'connected' : 'unreachable'}
                    </span>
                  </span>
                </div>
                <p className="mt-3 text-[11.5px] text-muted">
                  {dockerResult?.message || settings?.docker?.message || 'Set DOCKER_HOST to point DevDeck at a daemon.'}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" size="sm" icon="refresh" onClick={testDocker} loading={testingDocker}>
                    Test connection
                  </Button>
                </div>
                {dockerResult?.connected && dockerResult.containers?.length > 0 && (
                  <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-line">
                    <table className="table-base">
                      <thead>
                        <tr>
                          <th>Container</th>
                          <th>Image</th>
                          <th>State</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dockerResult.containers.map((c) => (
                          <tr key={c.id}>
                            <td className="font-mono text-[11px]">{c.name}</td>
                            <td className="truncate font-mono text-[11px] text-muted">{c.image}</td>
                            <td>
                              <Badge
                                className={
                                  c.state === 'running' ? 'bg-emerald-50 text-emerald-700' : 'bg-line-soft text-muted'
                                }
                              >
                                {c.state}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}

          {tab === 'data' && (
            <>
              <section className="card p-5">
                <h2 className="section-title">Export</h2>
                <p className="meta mb-3">
                  Download everything you own as JSON — projects, tasks, notes (with revisions), commands, runs,
                  services, activity and linked repositories.
                </p>
                <Button variant="secondary" size="sm" icon="download" onClick={exportData}>
                  Export workspace JSON
                </Button>
              </section>

              <section className="card p-5">
                <h2 className="section-title">Import</h2>
                <p className="meta mb-3">
                  Restore from a previous DevDeck export. Records are merged into this workspace with new ids.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  icon="upload"
                  onClick={() => fileRef.current?.click()}
                  loading={importing}
                >
                  Choose export file…
                </Button>
              </section>

              <section className="card border-red-200 p-5">
                <h2 className="text-[13px] font-semibold text-red-700">Danger zone</h2>
                <p className="meta mb-3">
                  Permanently delete every project, task, note, command, run, service and activity entry in this
                  workspace. Your account stays intact.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="danger" size="sm" icon="trash" onClick={() => setResetOpen(true)}>
                    Clear workspace data
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="logout"
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Delete your account?',
                        description: 'This removes the account and all of its data. It cannot be undone.',
                        confirmLabel: 'Delete account',
                      });
                      if (!ok) return;
                      try {
                        await api.del('/auth/me');
                        logout();
                        navigate('/login');
                      } catch (err) {
                        toast.error(err.message);
                      }
                    }}
                  >
                    Delete account
                  </Button>
                </div>
              </section>

              <section className="card p-5">
                <h2 className="section-title">Storage</h2>
                <p className="meta mb-3">
                  DevDeck stores everything in a single SQLite database with FTS5 full-text search. Set{' '}
                  <code className="font-mono text-[11.5px]">DATABASE_URL</code> to change the location.
                </p>
                <CodeBlock
                  language=".env"
                  code={`DATABASE_URL=./server/data/devdeck.db\nJWT_SECRET=change-me-in-production\nPORT=4000\nDOCKER_HOST=unix:///var/run/docker.sock`}
                />
              </section>
            </>
          )}
        </div>
      </div>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Clear workspace data?"
        description="All projects, tasks, notes, commands and activity will be deleted."
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={resetWorkspace}>
              Delete everything
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-soft">
          This cannot be undone. Export your workspace first if you want a backup.
        </p>
      </Modal>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-brand-600' : 'bg-[#d3d8e2]'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function ToggleRow({ title, description, checked, onChange }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-line p-3">
      <div>
        <p className="text-[12.5px] font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}
