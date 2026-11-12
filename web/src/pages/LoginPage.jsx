import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext.jsx';
import { Button, Spinner } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { useToast } from '../lib/ToastContext.jsx';

const FEATURES = [
  { icon: 'folder', title: 'Projects & tasks', text: 'Every repo, task and decision in one place.' },
  { icon: 'terminal', title: 'Safe command runner', text: 'Allowlisted shell commands with streamed output.' },
  { icon: 'server', title: 'Local services', text: 'Watch your containers, ports and resource usage.' },
  { icon: 'git-branch', title: 'GitHub context', text: 'Commits, branches and PRs beside the work.' },
];

export default function LoginPage() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const { login, register, demoLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const from = location.state?.from || '/';

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.email.trim(), form.password);
        toast.success('Welcome back');
      } else {
        await register({ name: form.name.trim(), email: form.email.trim(), password: form.password });
        toast.success('Workspace created', { description: 'We seeded sample projects so you can explore.' });
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const startDemo = async () => {
    setDemoLoading(true);
    setError(null);
    try {
      await demoLogin();
      toast.success('Signed in to the demo workspace');
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Left / brand panel */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-[#0e1320] p-10 lg:flex xl:w-[48%]">
        <div className="absolute inset-0 grid-dots opacity-[0.18]" />
        <div
          className="absolute -left-32 top-1/4 h-[420px] w-[420px] rounded-full opacity-30 blur-[110px]"
          style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }}
        />
        <div
          className="absolute -right-20 bottom-10 h-[320px] w-[320px] rounded-full opacity-25 blur-[100px]"
          style={{ background: 'radial-gradient(circle, #0ea5e9 0%, transparent 70%)' }}
        />

        <div className="relative">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-lg">
              <span className="text-[16px] font-black">D</span>
            </span>
            <div>
              <p className="text-[15px] font-bold tracking-tight text-white">DevDeck</p>
              <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-white/40">
                Engineering cockpit
              </p>
            </div>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-[32px] font-bold leading-[1.15] tracking-[-0.025em] text-white">
            Your whole dev workflow,
            <br />
            in one private deck.
          </h1>
          <p className="mt-4 text-[14px] leading-relaxed text-white/55">
            Stop scattering context across Notion, terminal history, GitHub tabs and Docker Desktop. DevDeck is
            a local-first workspace and API layer for the work you actually do.
          </p>

          <div className="mt-8 grid gap-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.07] text-white/70 ring-1 ring-white/10">
                  <Icon name={f.icon} size={14} />
                </span>
                <div>
                  <p className="text-[12.5px] font-semibold text-white/90">{f.title}</p>
                  <p className="text-[11.5px] leading-snug text-white/40">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-4 text-[11px] text-white/35">
          <span className="flex items-center gap-1.5">
            <Icon name="shield" size={12} /> Local-first SQLite
          </span>
          <span className="flex items-center gap-1.5">
            <Icon name="lock" size={12} /> Hashed credentials
          </span>
          <span className="flex items-center gap-1.5">
            <Icon name="bolt" size={12} /> Real-time updates
          </span>
        </div>
      </div>

      {/* Right / form */}
      <div className="flex w-full flex-col justify-center px-5 py-10 sm:px-10 lg:w-[54%] xl:w-[52%]">
        <div className="mx-auto w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-brand-500 to-brand-700 text-white">
              <span className="text-[14px] font-black">D</span>
            </span>
            <span className="text-[15px] font-bold tracking-tight text-ink">DevDeck</span>
          </div>

          <h2 className="text-[22px] font-bold tracking-[-0.02em] text-ink">
            {mode === 'login' ? 'Sign in to your deck' : 'Create your workspace'}
          </h2>
          <p className="mt-1.5 text-[13px] text-muted">
            {mode === 'login'
              ? 'Your projects, commands and notes are private to your account.'
              : 'We’ll seed sample projects, tasks and notes so the app feels alive immediately.'}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-3.5">
            {mode === 'register' && (
              <div>
                <label className="field-label" htmlFor="name">
                  Full name
                </label>
                <input
                  id="name"
                  className="input"
                  placeholder="Alex Rivera"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  minLength={2}
                  autoComplete="name"
                />
              </div>
            )}
            <div>
              <label className="field-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder="you@company.dev"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <label className="field-label" htmlFor="password">
                  Password
                </label>
                {mode === 'login' && (
                  <span className="mb-1.5 text-[11px] text-muted">min 8 characters</span>
                )}
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-9"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={mode === 'register' ? 8 : 1}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Icon name={showPassword ? 'eye-off' : 'eye'} size={14} />
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                <Icon name="alert-circle" size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" variant="primary" className="w-full py-2.5" loading={loading}>
              {mode === 'login' ? 'Sign in' : 'Create workspace'}
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-line" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted">or</span>
            <div className="h-px flex-1 bg-line" />
          </div>

          <Button
            variant="secondary"
            className="w-full py-2.5"
            icon="sparkles"
            onClick={startDemo}
            loading={demoLoading}
          >
            Explore the demo workspace
          </Button>
          <p className="mt-2 text-center text-[11px] text-muted">
            Pre-loaded with 4 projects, 20 tasks, command history and notes.
          </p>

          <p className="mt-7 text-center text-[12.5px] text-muted">
            {mode === 'login' ? "Don't have a workspace?" : 'Already have an account?'}{' '}
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
              }}
              className="font-semibold text-brand-600 hover:underline"
            >
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
