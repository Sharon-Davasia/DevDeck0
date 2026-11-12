export function relativeTime(input) {
  if (!input) return '—';
  const date = typeof input === 'number' ? new Date(input) : new Date(input);
  const diff = Date.now() - date.getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  const units = [
    [60_000, 'second', 1000],
    [3_600_000, 'minute', 60_000],
    [86_400_000, 'hour', 3_600_000],
    [604_800_000, 'day', 86_400_000],
    [2_592_000_000, 'week', 604_800_000],
    [31_536_000_000, 'month', 2_592_000_000],
    [Infinity, 'year', 31_536_000_000],
  ];
  if (abs < 45_000) return future ? 'in a moment' : 'just now';
  for (const [limit, unit, ms] of units) {
    if (abs < limit) {
      const n = Math.round(abs / ms);
      const label = `${n} ${unit}${n === 1 ? '' : 's'}`;
      return future ? `in ${label}` : `${label} ago`;
    }
  }
  return date.toLocaleDateString();
}

export function formatDate(input, opts = {}) {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...opts });
}

export function formatDateTime(input) {
  if (!input) return '—';
  const d = new Date(input);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTime(input) {
  if (!input) return '—';
  return new Date(input).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function formatDuration(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export function formatUptime(ms) {
  if (!ms || ms < 0) return '—';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function dueLabel(due, status) {
  if (!due) return null;
  const d = new Date(due);
  const today = new Date();
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(d) - startOfDay(today)) / 86_400_000);
  if (status === 'done') return { text: formatDate(due), tone: 'neutral' };
  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, tone: 'danger' };
  if (diffDays === 0) return { text: 'Due today', tone: 'warning' };
  if (diffDays === 1) return { text: 'Due tomorrow', tone: 'warning' };
  if (diffDays <= 7) return { text: `Due in ${diffDays}d`, tone: 'neutral' };
  return { text: formatDate(due), tone: 'neutral' };
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export function pluralize(n, word, plural) {
  return `${n} ${n === 1 ? word : plural || `${word}s`}`;
}

export const PRIORITY = {
  urgent: { label: 'Urgent', className: 'bg-red-50 text-red-700 ring-1 ring-red-100', dot: 'bg-red-500' },
  high: { label: 'High', className: 'bg-orange-50 text-orange-700 ring-1 ring-orange-100', dot: 'bg-orange-500' },
  medium: { label: 'Medium', className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100', dot: 'bg-amber-400' },
  low: { label: 'Low', className: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200/70', dot: 'bg-slate-400' },
};

export const STATUS = {
  todo: { label: 'To do', className: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200/80', dot: 'bg-slate-400' },
  in_progress: { label: 'In progress', className: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100', dot: 'bg-blue-500' },
  blocked: { label: 'Blocked', className: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100', dot: 'bg-rose-500' },
  done: { label: 'Done', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100', dot: 'bg-emerald-500' },
};

export const SERVICE_STATUS = {
  running: { label: 'Running', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100', dot: 'bg-emerald-500' },
  stopped: { label: 'Stopped', className: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200/80', dot: 'bg-slate-400' },
  restarting: { label: 'Restarting', className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100', dot: 'bg-amber-500' },
  error: { label: 'Error', className: 'bg-red-50 text-red-700 ring-1 ring-red-100', dot: 'bg-red-500' },
};

export const RUN_STATUS = {
  success: { label: 'Success', className: 'text-emerald-700 bg-emerald-50 ring-1 ring-emerald-100' },
  failed: { label: 'Failed', className: 'text-red-700 bg-red-50 ring-1 ring-red-100' },
  cancelled: { label: 'Cancelled', className: 'text-amber-700 bg-amber-50 ring-1 ring-amber-100' },
  running: { label: 'Running', className: 'text-blue-700 bg-blue-50 ring-1 ring-blue-100' },
};

export const NOTE_KIND = {
  note: { label: 'Note', icon: 'note' },
  decision: { label: 'Decision', icon: 'scale' },
  debug: { label: 'Debug', icon: 'bug' },
  snippet: { label: 'Snippet', icon: 'code' },
  doc: { label: 'Doc', icon: 'book' },
};

export const ACTIVITY_META = {
  commit: { label: 'Commit', tone: 'bg-violet-50 text-violet-600 ring-violet-100' },
  command: { label: 'Command', tone: 'bg-sky-50 text-sky-600 ring-sky-100' },
  task: { label: 'Task', tone: 'bg-emerald-50 text-emerald-600 ring-emerald-100' },
  service: { label: 'Service', tone: 'bg-amber-50 text-amber-600 ring-amber-100' },
  note: { label: 'Note', tone: 'bg-pink-50 text-pink-600 ring-pink-100' },
  project: { label: 'Project', tone: 'bg-indigo-50 text-indigo-600 ring-indigo-100' },
  github: { label: 'GitHub', tone: 'bg-slate-100 text-slate-700 ring-slate-200' },
  auth: { label: 'Account', tone: 'bg-slate-100 text-slate-700 ring-slate-200' },
  system: { label: 'System', tone: 'bg-slate-100 text-slate-700 ring-slate-200' },
};
