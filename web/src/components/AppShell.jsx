import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext.jsx';
import { useRealtime } from '../lib/realtime.js';
import { useLocalStorage, useMediaQuery } from '../lib/useApi.js';
import { Avatar, Badge, Button, Dropdown, IconButton, MenuItem, StatusDot, Tooltip } from './ui.jsx';
import { Icon } from './Icon.jsx';
import CommandPalette from './CommandPalette.jsx';
import { api } from '../lib/api.js';

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'home', end: true },
  { to: '/projects', label: 'Projects', icon: 'folder' },
  { to: '/tasks', label: 'Tasks', icon: 'check-square', badgeKey: 'tasksDueToday' },
  { to: '/commands', label: 'Commands', icon: 'terminal' },
  { to: '/services', label: 'Services', icon: 'server' },
  { to: '/notes', label: 'Notes', icon: 'note' },
  { to: '/github', label: 'GitHub', icon: 'git-branch' },
  { to: '/activity', label: 'Activity', icon: 'activity' },
];

export default function AppShell() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useLocalStorage('devdeck.sidebar.collapsed', false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [counts, setCounts] = useState({});

  const { connected } = useRealtime({
    'activity:new': () => setPulse((p) => p + 1),
    'service:updated': () => {},
  });
  const [pulse, setPulse] = useState(0);

  // Lightweight polling of the badge counts (cheap aggregate endpoint).
  const refreshCounts = useCallback(async () => {
    try {
      const res = await api.get('/tasks/stats');
      setCounts({
        tasksDueToday: res.data.due_today || 0,
        overdue: res.data.overdue || 0,
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshCounts();
    const t = setInterval(refreshCounts, 60_000);
    return () => clearInterval(t);
  }, [refreshCounts, pulse]);

  // Global ⌘K / Ctrl+K handler
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          setPaletteOpen(true);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Theme handling
  useEffect(() => {
    const theme = user?.theme || 'light';
    const apply = () => {
      const dark =
        theme === 'dark' ||
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.classList.toggle('light', !dark);
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [user?.theme]);

  const toggleTheme = async () => {
    const next = user?.theme === 'dark' ? 'light' : 'dark';
    updateUser({ theme: next });
    try {
      await api.patch('/auth/me', { theme: next });
    } catch {
      /* optimistic only */
    }
  };

  const showLabels = isDesktop ? !collapsed : true;
  const sidebarWidth = isDesktop ? (collapsed ? 'w-[68px]' : 'w-[236px]') : 'w-[248px]';

  const navItems = useMemo(
    () =>
      NAV.map((item) => ({
        ...item,
        badge: item.badgeKey ? counts[item.badgeKey] : undefined,
      })),
    [counts]
  );

  return (
    <div className="min-h-screen bg-canvas">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 animate-fade-in bg-[#0b1220]/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex ${sidebarWidth} flex-col border-r border-line bg-rail transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className={`flex h-[58px] items-center gap-2.5 border-b border-line px-3.5 ${collapsed && isDesktop ? 'justify-center px-0' : ''}`}>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2.5 overflow-hidden"
            aria-label="DevDeck home"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-[0_2px_6px_rgba(79,70,229,0.35)]">
              <span className="text-[15px] font-black leading-none">D</span>
            </span>
            {(!collapsed || !isDesktop) && (
              <span className="flex flex-col items-start leading-none">
                <span className="text-[14px] font-bold tracking-[-0.02em] text-ink">DevDeck</span>
                <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.10em] text-muted">
                  Engineering cockpit
                </span>
              </span>
            )}
          </button>
        </div>

        {/* Search trigger */}
        <div className={`px-2.5 pt-3 ${collapsed && isDesktop ? 'px-2' : ''}`}>
          <button
            onClick={() => setPaletteOpen(true)}
            className={`flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-2 py-1.5 text-[12.5px] text-muted transition-colors hover:border-[#d8dce6] hover:text-soft ${
              collapsed && isDesktop ? 'justify-center px-0' : ''
            }`}
          >
            <Icon name="search" size={14} />
            {(!collapsed || !isDesktop) && (
              <>
                <span className="flex-1 text-left">Search everything…</span>
                <span className="kbd">⌘K</span>
              </>
            )}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-3">
          {(!collapsed || !isDesktop) && (
            <p className="mb-1.5 px-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted/80">
              Workspace
            </p>
          )}
          <div className="space-y-0.5">
            {navItems.map((item) => (
              <Tooltip key={item.to} label={collapsed && isDesktop ? item.label : ''} className="w-full" side="right">
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `nav-item w-full ${isActive ? 'nav-item-active' : ''} ${
                      collapsed && isDesktop ? 'justify-center px-0' : ''
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        name={item.icon}
                        size={16}
                        className={isActive ? 'text-brand-600' : 'text-muted'}
                        strokeWidth={isActive ? 2 : 1.75}
                      />
                      {(!collapsed || !isDesktop) && (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.badge > 0 && (
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums ${
                                item.badgeKey === 'overdue'
                                  ? 'bg-red-50 text-red-600'
                                  : 'bg-line-soft text-muted'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </>
                  )}
                </NavLink>
              </Tooltip>
            ))}
          </div>

          <div className="my-3 h-px bg-line-soft" />

          <Tooltip label={collapsed && isDesktop ? 'Settings' : ''} className="w-full" side="right">
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `nav-item w-full ${isActive ? 'nav-item-active' : ''} ${collapsed && isDesktop ? 'justify-center px-0' : ''}`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name="settings" size={16} className={isActive ? 'text-brand-600' : 'text-muted'} />
                  {(!collapsed || !isDesktop) && <span>Settings</span>}
                </>
              )}
            </NavLink>
          </Tooltip>
        </nav>

        {/* Connection + user */}
        <div className="border-t border-line p-2.5">
          {(!collapsed || !isDesktop) && (
            <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-surface px-2 py-1.5 text-[11px] ring-1 ring-line">
              <StatusDot className={connected ? 'bg-emerald-500' : 'bg-amber-400'} pulse={connected} />
              <span className="font-medium text-soft">{connected ? 'Live updates' : 'Reconnecting…'}</span>
              <span className="ml-auto font-mono text-[10px] text-muted">SSE</span>
            </div>
          )}
          <Dropdown
            trigger={
              <button
                className={`flex w-full items-center gap-2 rounded-xl p-1.5 text-left transition-colors hover:bg-line-soft ${
                  collapsed && isDesktop ? 'justify-center' : ''
                }`}
              >
                <Avatar name={user?.name} color={user?.avatarColor} size={28} />
                {(!collapsed || !isDesktop) && (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold leading-tight text-ink">{user?.name}</p>
                      <p className="truncate text-[11px] leading-tight text-muted">{user?.email}</p>
                    </div>
                    <Icon name="chevron-down" size={13} className="text-muted" />
                  </>
                )}
              </button>
            }
          >
            <div className="px-2 py-1.5">
              <p className="text-[12px] font-semibold text-ink">{user?.name}</p>
              <p className="text-[11px] text-muted">{user?.email}</p>
            </div>
            <div className="my-1 h-px bg-line-soft" />
            <MenuItem icon="settings" onClick={() => navigate('/settings')}>
              Settings
            </MenuItem>
            <MenuItem icon="keyboard" onClick={() => setPaletteOpen(true)} shortcut="⌘K">
              Command palette
            </MenuItem>
            <MenuItem icon={user?.theme === 'dark' ? 'sparkles' : 'eye'} onClick={toggleTheme}>
              {user?.theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </MenuItem>
            <div className="my-1 h-px bg-line-soft" />
            <MenuItem
              icon="logout"
              danger
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              Sign out
            </MenuItem>
          </Dropdown>
        </div>

        {isDesktop && (
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="absolute -right-3 top-[68px] hidden h-6 w-6 place-items-center rounded-full border border-line bg-surface text-muted shadow-card transition-colors hover:text-ink lg:grid"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={12} />
          </button>
        )}
      </aside>

      {/* Main */}
      <div className={`flex min-h-screen flex-col transition-[padding] duration-200 ${isDesktop ? (collapsed ? 'pl-[68px]' : 'pl-[236px]') : ''}`}>
        <header className="sticky top-0 z-30 flex h-[58px] items-center gap-2 border-b border-line bg-canvas/85 px-4 backdrop-blur-md sm:px-6">
          <button
            className="btn-icon -ml-1 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Icon name="menu" size={18} />
          </button>

          <Breadcrumbs />

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] text-muted transition-colors hover:border-[#d8dce6] hover:text-soft sm:flex"
            >
              <Icon name="search" size={13} />
              <span>Search</span>
              <span className="kbd ml-1">⌘K</span>
            </button>
            <IconButton icon="search" label="Search" className="sm:hidden" onClick={() => setPaletteOpen(true)} />
            <Tooltip label={user?.theme === 'dark' ? 'Light mode' : 'Dark mode'}>
              <IconButton
                icon={user?.theme === 'dark' ? 'sparkles' : 'eye'}
                label="Toggle theme"
                onClick={toggleTheme}
              />
            </Tooltip>
            <div className="mx-1 hidden h-5 w-px bg-line sm:block" />
            <Button
              variant="primary"
              size="sm"
              icon="plus"
              className="hidden sm:inline-flex"
              onClick={() => navigate('/projects?new=1')}
            >
              New project
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 pb-16 pt-5 sm:px-6 sm:pb-20 sm:pt-6">
          <div className="mx-auto w-full max-w-[1240px]">
            <Outlet />
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

function Breadcrumbs() {
  const location = useLocation();
  const navigate = useNavigate();
  const segments = location.pathname.split('/').filter(Boolean);
  const labels = {
    projects: 'Projects',
    tasks: 'Tasks',
    commands: 'Commands',
    services: 'Services',
    notes: 'Notes',
    activity: 'Activity',
    github: 'GitHub',
    settings: 'Settings',
    search: 'Search',
  };
  if (!segments.length) {
    return (
      <div className="flex items-center gap-1.5 text-[12.5px]">
        <span className="font-semibold text-ink">Dashboard</span>
        <span className="hidden text-muted sm:inline">· overview</span>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[12.5px]">
      <button onClick={() => navigate('/')} className="text-muted transition-colors hover:text-ink">
        Dashboard
      </button>
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        const label = labels[seg] || (seg.length > 20 ? 'Detail' : seg.charAt(0).toUpperCase() + seg.slice(1));
        return (
          <span key={`${seg}-${i}`} className="flex min-w-0 items-center gap-1.5">
            <Icon name="chevron-right" size={12} className="shrink-0 text-muted/60" />
            <span className={`truncate ${isLast ? 'font-semibold text-ink' : 'text-muted'}`}>{label}</span>
          </span>
        );
      })}
    </div>
  );
}
