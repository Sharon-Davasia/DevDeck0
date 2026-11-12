import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { useDebounced, useLocalStorage } from '../lib/useApi.js';
import { Icon } from './Icon.jsx';
import { Spinner } from './ui.jsx';

const QUICK_ACTIONS = [
  { id: 'new-project', label: 'Create a new project', icon: 'plus', to: '/projects?new=1', group: 'Actions' },
  { id: 'new-task', label: 'Create a new task', icon: 'check-square', to: '/tasks?new=1', group: 'Actions' },
  { id: 'new-note', label: 'Write a new note', icon: 'note', to: '/notes?new=1', group: 'Actions' },
  { id: 'run-command', label: 'Run a saved command', icon: 'play', to: '/commands?run=1', group: 'Actions' },
  { id: 'go-settings', label: 'Open settings', icon: 'settings', to: '/settings', group: 'Navigate' },
  { id: 'go-services', label: 'View local services', icon: 'server', to: '/services', group: 'Navigate' },
  { id: 'go-github', label: 'GitHub integration', icon: 'git-branch', to: '/github', group: 'Navigate' },
  { id: 'go-activity', label: 'Activity timeline', icon: 'activity', to: '/activity', group: 'Navigate' },
];

const ENTITY_META = {
  project: { label: 'Projects', icon: 'folder', to: (r) => `/projects/${r.id}` },
  task: { label: 'Tasks', icon: 'check-square', to: () => '/tasks' },
  note: { label: 'Notes', icon: 'note', to: (r) => `/notes/${r.id}` },
  command: { label: 'Commands', icon: 'terminal', to: () => '/commands' },
  run: { label: 'Runs', icon: 'play', to: () => '/commands?tab=history' },
  service: { label: 'Services', icon: 'server', to: () => '/services' },
  repo: { label: 'Repositories', icon: 'git-branch', to: () => '/github' },
  activity: { label: 'Activity', icon: 'activity', to: () => '/activity' },
};

const RECENT_KEY = 'devdeck.palette.recent';

export default function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useLocalStorage(RECENT_KEY, []);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();
  const debounced = useDebounced(query, 180);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !debounced.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get(`/search${qs({ q: debounced, limit: 24 })}`)
      .then((res) => {
        if (!cancelled) setResults(res.data.results || []);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  const items = useMemo(() => {
    if (!query.trim()) {
      const recentItems = recent.slice(0, 4).map((r) => ({
        ...r,
        key: `recent-${r.id}`,
        icon: ENTITY_META[r.entity]?.icon || 'search',
        group: 'Recent',
        onSelect: () => go(r.entity, r),
      }));
      const actions = QUICK_ACTIONS.filter((a) =>
        query ? a.label.toLowerCase().includes(query.toLowerCase()) : true
      ).map((a) => ({
        ...a,
        key: a.id,
        onSelect: () => {
          navigate(a.to);
          onClose();
        },
      }));
      return [...recentItems, ...actions];
    }
    const q = query.toLowerCase();
    const actions = QUICK_ACTIONS.filter((a) => a.label.toLowerCase().includes(q)).map((a) => ({
      ...a,
      key: a.id,
      onSelect: () => {
        navigate(a.to);
        onClose();
      },
    }));
    const entityItems = results.map((r) => ({
      ...r,
      key: `${r.entity}-${r.id}`,
      icon: ENTITY_META[r.entity]?.icon || 'search',
      group: ENTITY_META[r.entity]?.label || 'Results',
      onSelect: () => go(r.entity, r),
    }));
    return [...entityItems, ...actions];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, results, recent]);

  function go(entity, row) {
    const meta = ENTITY_META[entity];
    const to = meta?.to(row) || '/';
    setRecent((prev) => [{ id: row.id, title: row.title, entity, projectId: row.projectId }, ...prev.filter((p) => p.id !== row.id)].slice(0, 8));
    navigate(to);
    onClose();
  }

  useEffect(() => setActive(0), [items.length]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => Math.min(items.length - 1, a + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        items[active]?.onSelect?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, active, onClose]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const grouped = items.reduce((acc, item) => {
    const key = item.group || 'Results';
    acc[key] ||= [];
    acc[key].push(item);
    return acc;
  }, {});

  let runningIndex = -1;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 animate-fade-in bg-[#0b1220]/45 backdrop-blur-[3px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-[600px] animate-slide-down overflow-hidden rounded-2xl border border-line bg-elevated shadow-pop"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-3.5">
          <Icon name="search" size={16} className="text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, tasks, notes, commands…"
            className="h-12 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-muted"
          />
          {loading && <Spinner size={14} className="text-muted" />}
          <span className="kbd">Esc</span>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {!items.length && !loading && (
            <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-line-soft text-muted">
                <Icon name="search" size={16} />
              </div>
              <p className="text-[13px] font-medium text-ink">No matches for “{query}”</p>
              <p className="mt-0.5 text-[11.5px] text-muted">
                Try a project name, a command, a task or a note title.
              </p>
            </div>
          )}

          {Object.entries(grouped).map(([group, groupItems]) => (
            <div key={group} className="mb-1">
              <p className="px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                {group}
              </p>
              {groupItems.map((item) => {
                runningIndex += 1;
                const index = runningIndex;
                const isActive = index === active;
                return (
                  <button
                    key={item.key}
                    data-index={index}
                    onMouseMove={() => setActive(index)}
                    onClick={item.onSelect}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                      isActive ? 'bg-brand-50' : 'hover:bg-line-soft'
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                        isActive ? 'bg-brand-100 text-brand-700' : 'bg-line-soft text-muted'
                      }`}
                    >
                      <Icon name={item.icon} size={13} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[12.5px] font-medium ${isActive ? 'text-brand-800' : 'text-ink'}`}>
                        {item.title || item.label}
                      </span>
                      {item.snippet && (
                        <span className="mt-0.5 block truncate text-[11px] text-muted">{item.snippet}</span>
                      )}
                    </span>
                    {item.projectName && (
                      <span className="chip hidden shrink-0 sm:inline-flex">{item.projectName}</span>
                    )}
                    {isActive && <Icon name="arrow-right" size={13} className="shrink-0 text-brand-500" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-line bg-[#fbfcfe] px-3.5 py-2 text-[10.5px] text-muted">
          <span className="flex items-center gap-1">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> navigate
          </span>
          <span className="flex items-center gap-1">
            <span className="kbd">↵</span> open
          </span>
          <span className="ml-auto flex items-center gap-1">
            <Icon name="bolt" size={11} /> Full-text search
          </span>
        </div>
      </div>
    </div>
  );
}
