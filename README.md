# DevDeck

**A personal, local-first engineering cockpit.** Instead of scattering work across Notion, terminal history,
GitHub tabs, Docker Desktop and random notes, DevDeck gives you one private dashboard and API layer for the
workflow you actually have.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Dashboard   Projects   Tasks   Commands   Services   Notes   GitHub │
│  ─────────────────────────────────────────────────────────────────── │
│  active projects · tasks due today · live command output · services  │
│  commits · weekly stats · searchable daily activity timeline         │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Highlights

| Area | What you get |
| --- | --- |
| **Auth** | Email + password sign-up/login, bcrypt hashes, JWT sessions, protected routes, per-user data isolation on every query |
| **Projects** | Create / edit / archive / delete. Each project owns its description, stack, repo, local path, environment, tasks, notes, commands, services and activity |
| **Dashboard** | Greeting + stats, tasks due today, project health, recent command runs, service monitor, recent commits, weekly activity chart, live activity feed |
| **Tasks** | Full CRUD, priority, status, due dates, project association, filtering, sorting, search, bulk status changes, optimistic completion |
| **Commands** | Reusable library with working directory, tags and project. Run from the UI and watch **streamed output** live, inspect exit code + duration, re-run, cancel |
| **Safety** | Controlled process runner: allowlist policy, blocklist, dangerous-command confirmation, timeouts, output caps, cancellation, env whitelisting |
| **Services** | Docker daemon integration (containers, images, ports, state, CPU/memory) with start/stop/restart/inspect and live status updates |
| **GitHub** | Link repositories, view commits, branches, pull requests, issues and contributors. Personal access token encrypted at rest, cached demo snapshots offline |
| **Notes** | Markdown notes, decisions, debugging findings, snippets and docs — with tags, pinning, search, preview/edit modes and **version history** |
| **Activity** | Automatically recorded timeline of commits, commands, completed tasks, service events and manual entries — grouped by day, filterable |
| **Search** | SQLite **FTS5** full-text search across every entity, grouped by type with contextual snippets, project filters and recent searches |
| **Command palette** | `⌘K` / `Ctrl+K` keyboard-first navigation across the whole workspace |
| **Real-time** | SSE stream pushes activity, service state and command output — no refresh needed |
| **Data** | Local-first SQLite, optional PostgreSQL-ready schema, JSON export/import, workspace reset |

---

## Quick start

```bash
# 1. install (Node 22+ required — uses the built-in node:sqlite driver)
npm install

# 2. configure
cp .env.example .env          # set JWT_SECRET

# 3. run API + web together
npm run dev
#    API  → http://localhost:4000
#    Web  → http://localhost:5173
```

Open <http://localhost:5173>, click **Explore the demo workspace**, or sign up — every new account is seeded
with a realistic workspace (4 active projects + 1 archived, 20 tasks, 15 saved commands with real output,
8 notes, 7 services, 4 linked repositories and a two-week activity timeline).

Demo credentials if you prefer to type them:

```
email:    demo@devdeck.local
password: devdeck123
```

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | API (`node --watch`) + Vite dev server with `/api` proxy |
| `npm run build` | Production SPA build into `web/dist` (served by the API) |
| `npm start` | Serve API + built SPA on one port |
| `npm test` | API test suite (node:test + supertest) |
| `npm run smoke` | Boots a temp API and mounts **every route** in jsdom against live data |
| `npm run seed` | Re-seed the demo account |
| `npm run lint` | Repo hygiene checks (route resolution, logging, env docs) |

---

## Architecture

```
server/                 Express API (ESM, Node 22)
  src/config.js         env parsing + production guards
  src/db/               schema.sql, migrations, FTS index, seed data, logger
  src/lib/              auth, command policy, process runner, docker, github,
                        crypto, realtime (SSE pub/sub), validation, errors
  src/routes/           auth · projects · tasks · commands · notes · services
                        github · dashboard · search · activity · events · settings
  tests/                API + isolation tests

web/                    React 18 + Vite + Tailwind SPA
  src/lib/              api client, auth context, toasts, SSE hook, markdown
  src/components/       app shell, command palette, design-system primitives
  src/pages/            dashboard, projects, tasks, commands, services, notes,
                        activity, github, search, settings

scripts/                smoke-test harness + hygiene checks
docs/                   API reference
```

**Why `node:sqlite`?** DevDeck is meant to be cloned and run instantly. Using Node's built-in SQLite driver
means **zero native compilation** — no `node-gyp`, no Python toolchain, no prebuilt binaries. The schema is
plain SQL and portable (SQLite/libSQL now, Postgres with minor type changes — see `docs/API.md`).

---

## Safe command execution

Commands always go through `server/src/lib/commandPolicy.js`:

1. **Blocklist** — `sudo`, fork bombs, `curl | bash`, root deletes, force pushes, disk writes… → rejected.
2. **Dangerous patterns** — `rm -rf`, `docker prune`, `git reset --hard`, `kill -9`, `git push`… → allowed but
   require an explicit confirmation (`POST /api/commands/run` returns `428` unless `force: true`).
3. **Allowlist** — every segment of a compound command must start with a known binary (`npm`, `git`, `pytest`,
   `docker`, `uvicorn`, …). Disable with `COMMAND_REQUIRE_ALLOWLIST=false` at your own risk.

The runner then spawns `/bin/sh -c` with a whitelisted environment, a hard timeout
(`COMMAND_TIMEOUT_MS`), a capped output buffer (`COMMAND_MAX_OUTPUT_BYTES`), streaming output over SSE and
a `SIGTERM → SIGKILL` cancellation path.

> ⚠️ DevDeck executes commands on the host it runs on. Run it on your own machine, keep the allowlist tight, and
> don't expose the port to the internet.

---

## Docker

```bash
cp .env.example .env
# set JWT_SECRET to a long random string
docker compose up --build
# → http://localhost:4000
```

The compose file persists SQLite in a named volume (`/data`) and mounts `/var/run/docker.sock` read-only so the
service monitor can see your containers. Remove that mount if you'd rather not.

---

## Deployment notes

- **One process**: `npm run build && npm start` — Express serves `web/dist` with an SPA fallback.
- **Required in production**: `JWT_SECRET`. The server refuses to boot with the development default.
- **Reverse proxy**: SSE works through nginx/Caddy; the stream sets `X-Accel-Buffering: no` and the client
  reconnects with `retry: 3000`.
- **Backups**: the entire workspace is one SQLite file (`DATABASE_URL`). Copy it while the server is idle, or use
  **Settings → Data → Export** for a portable JSON snapshot.

---

## Testing

```bash
npm test         # 40 tests — API (18) + command policy & crypto (11) + client logic (11)
npm run smoke    # mounts all 13 routes in jsdom against a live seeded API
```

The API suite covers the security-critical paths explicitly: unauthenticated access, invalid tokens, cross-user
access to projects/tasks/notes/search, and cascade behaviour on delete.

CI (`.github/workflows/ci.yml`) runs the API tests, the production build, the render smoke test and a Docker
image build on every push and pull request.

---

## API

Full reference with request/response examples: [`docs/API.md`](docs/API.md).
Interactive docs are served by the app at `/api-docs` (see `docs/API.md` for the OpenAPI description).

```
GET    /api/health
POST   /api/auth/register | /api/auth/login | /api/auth/demo
GET    /api/dashboard
GET    /api/projects            POST /api/projects
GET    /api/tasks               POST /api/tasks        POST /api/tasks/bulk
GET    /api/commands            POST /api/commands/run POST /api/commands/runs/:id/cancel
GET    /api/services            POST /api/services/:id/start|stop|restart|inspect
GET    /api/notes               GET  /api/notes/:id    (revisions included)
GET    /api/github/repos        POST /api/github/integration
GET    /api/search?q=…          GET  /api/activity
GET    /api/events              (SSE, bearer token)
GET    /api/settings/export
```

---

## License

MIT — use it, fork it, make it yours.
