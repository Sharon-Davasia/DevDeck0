/**
 * Headless render smoke test.
 *
 * Boots the API on an ephemeral port, mounts every route with React in jsdom,
 * waits for real network data to arrive, and fails on any React error, crashed
 * render, or empty page. Catches both import-time and data-path regressions
 * without needing a browser binary in CI.
 *
 *   node scripts/build-smoke.mjs && node scripts/_smoke.bundle.mjs
 */
import { JSDOM } from 'jsdom';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, '..');

process.env.NODE_ENV = 'development';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = path.join('/tmp', `devdeck-smoke-${process.pid}.db`);
process.env.JWT_SECRET = 'smoke-secret';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://127.0.0.1:4599/',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.EventSource = class {
  constructor() {}
  addEventListener() {}
  close() {}
};
window.scrollTo = () => {};
window.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
});
// jsdom reports no support for the `input` event in some builds, which makes
// React fall back to the legacy IE code path. Provide the shim it expects.
dom.window.HTMLElement.prototype.attachEvent = function attachEvent() {};
dom.window.HTMLElement.prototype.detachEvent = function detachEvent() {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createApp } = await import('../server/src/index.js');
const { migrate } = await import('../server/src/db/migrate.js');
const { seedDemoUser } = await import('../server/src/db/seed.js');
migrate();
await seedDemoUser();

const app = createApp();
const server = await new Promise((resolve) => {
  const s = app.listen(4599, '127.0.0.1', () => resolve(s));
});

const nodeFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => {
  const full = String(url).startsWith('http') ? url : `http://127.0.0.1:4599${url}`;
  return nodeFetch(full, opts);
};

const login = await (
  await nodeFetch('http://127.0.0.1:4599/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@devdeck.local', password: 'devdeck123' }),
  })
).json();
localStorage.setItem('devdeck.token', login.token);
const auth = { Authorization: `Bearer ${login.token}` };
const projects = await (await nodeFetch('http://127.0.0.1:4599/api/projects?status=all', { headers: auth })).json();
const notes = await (await nodeFetch('http://127.0.0.1:4599/api/notes', { headers: auth })).json();

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter, Routes, Route } = await import('react-router-dom');
const { AuthProvider } = await import('../web/src/lib/AuthContext.jsx');
const { ToastProvider } = await import('../web/src/lib/ToastContext.jsx');
const { ConfirmProvider } = await import('../web/src/components/ui.jsx');
const AppShell = (await import('../web/src/components/AppShell.jsx')).default;

// Surface the real cause of failed lazy()/API calls instead of the error boundary.
const originalBoundary = AppShell;
void originalBoundary;
const routes = [
  ['/', 'Dashboard', () => import('../web/src/pages/Dashboard.jsx')],
  ['/projects', 'Projects', () => import('../web/src/pages/Projects.jsx')],
  [`/projects/${projects.data[0].id}`, 'ProjectDetail', () => import('../web/src/pages/ProjectDetail.jsx'), 'projects/:id'],
  ['/tasks', 'Tasks', () => import('../web/src/pages/Tasks.jsx')],
  ['/commands', 'Commands', () => import('../web/src/pages/Commands.jsx')],
  ['/services', 'Services', () => import('../web/src/pages/Services.jsx')],
  ['/notes', 'Notes', () => import('../web/src/pages/Notes.jsx')],
  [`/notes/${notes.data[0].id}`, 'NoteDetail', () => import('../web/src/pages/NoteDetail.jsx'), 'notes/:id'],
  ['/activity', 'Activity', () => import('../web/src/pages/Activity.jsx')],
  ['/github', 'GitHub', () => import('../web/src/pages/GitHub.jsx')],
  ['/search?q=ingest', 'SearchPage', () => import('../web/src/pages/SearchPage.jsx')],
  ['/settings', 'Settings', () => import('../web/src/pages/Settings.jsx')],
  ['/login', 'LoginPage', () => import('../web/src/pages/LoginPage.jsx'), 'login', true],
];

const ticks = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

for (const [route, name, loader, pattern, standalone] of routes) {
  const mod = await loader();
  if (!mod.default) {
    console.log(`✗ ${name}: module has no default export`);
    continue;
  }
  const Page = mod.default;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => {
    const text = args.map((a) => (a instanceof Error ? a.stack : String(a))).join(' ');
    errors.push(text);
  };
  let root;
  try {
    await act(async () => {
      root = createRoot(host, {
        onUncaughtError: (e) => errors.push(`uncaught: ${e?.stack || e}`),
        onRecoverableError: (e) => errors.push(`recoverable: ${e?.stack || e}`),
      });
      root.render(
        React.createElement(
          MemoryRouter,
          { initialEntries: [route] },
          React.createElement(
            AuthProvider,
            null,
            React.createElement(
              ToastProvider,
              null,
              React.createElement(
                ConfirmProvider,
                null,
                React.createElement(
                  Routes,
                  null,
                  standalone
                    ? React.createElement(Route, { path: route, element: React.createElement(Page) })
                    : React.createElement(
                        Route,
                        { path: '/', element: React.createElement(AppShell) },
                        React.createElement(Route, {
                          ...(route === '/'
                            ? { index: true }
                            : { path: pattern || route.split('?')[0].slice(1) }),
                          element: React.createElement(Page),
                        })
                      )
                )
              )
            )
          )
        )
      );
    });
    // Let real API calls resolve and re-render.
    for (let i = 0; i < 12; i += 1) {
      await act(async () => {
        await ticks(60);
      });
      if (!host.querySelector('.skeleton')) break;
    }
    await act(async () => {
      await ticks(150);
    });
    const text = host.textContent || '';
    const skeletons = host.querySelectorAll('.skeleton').length;
    if (process.env.SMOKE_DEBUG === name) {
      console.log('HTML length:', host.innerHTML.length);
      console.log(host.innerHTML.slice(-3000));
    }
    if (!host.querySelector('main > div > *') && name !== 'SearchPage') {
      const errEl = document.querySelector('[class*="alert-triangle"]');
      void errEl;
    }
    if (process.env.SMOKE_DEBUG === name) {
      console.log('TEXT:', (host.textContent || '').slice(0, 1200));
    }
    if (process.env.SMOKE_HTML === name) {
      const cssFile = fs.readdirSync(`${dir}/web/dist/assets`).find((f) => f.endsWith('.css'));
      const css = fs.readFileSync(`${dir}/web/dist/assets/${cssFile}`, 'utf8');
      fs.writeFileSync(
        '/tmp/devdeck-html.html',
        `<!doctype html><html class="light"><head><meta charset="utf-8"><style>${css}</style></head><body class="bg-canvas">${host.innerHTML}</body></html>`
      );
      console.log('wrote /tmp/devdeck-html.html');
    }
    const ok = text.length > 400 && errors.length === 0;
    results.push({ route, name, ok, chars: text.length, skeletons, errors: errors.slice(0, 2), sample: text.slice(0, 160) });
  } catch (err) {
    results.push({ route, name, ok: false, chars: 0, skeletons: 0, errors: [err.stack?.split('\n').slice(0, 6).join('\n') || err.message] });
  } finally {
    console.error = originalError;
    try {
      await act(async () => root?.unmount());
    } catch {}
    host.remove();
  }
}

server.close();
let failures = 0;
for (const r of results) {
  if (!r.ok) failures += 1;
  console.log(
    `${r.ok ? '✓' : '✗'} ${r.name.padEnd(15)} ${r.route.padEnd(48)} ${String(r.chars).padStart(6)} chars${
      r.skeletons ? ` (${r.skeletons} skeletons left)` : ''
    }`
  );
  for (const e of r.errors) console.log(`     ${String(e).replace(/\n/g, '\n     ').slice(0, 700)}`);
  if (!r.ok && r.sample) console.log(`     text: ${JSON.stringify(r.sample)}`);
}
for (const suffix of ['', '-wal', '-shm']) {
  if (fs.existsSync(process.env.DATABASE_URL + suffix)) fs.unlinkSync(process.env.DATABASE_URL + suffix);
}
console.log(`\n${results.length - failures}/${results.length} routes mounted with live data`);
process.exit(failures ? 1 : 0);
