# DevDeck API

Base URL: `http://localhost:4000/api` (or same origin when the SPA is served by the API).

All endpoints except `/health` and `/auth/{register,login,demo}` require a bearer token:

```
Authorization: Bearer <jwt>
```

Errors are JSON and always include a human-readable `error`, plus `details[]` for validation failures:

```json
{ "error": "Validation failed", "details": [{ "path": "email", "message": "Invalid email" }] }
```

| Status | Meaning |
| --- | --- |
| 400 | Validation / policy rejection |
| 401 | Missing, invalid or expired session |
| 404 | Not found **or not owned by the caller** |
| 409 | Conflict |
| 428 | Command needs explicit confirmation (`requiresConfirmation: true`) |
| 500 | Unhandled server error (details logged, never leaked in production) |

List endpoints accept `page`, `pageSize` (max 100) and return:

```json
{ "data": [ ... ], "meta": { "page": 1, "pageSize": 25, "total": 42, "totalPages": 2, "hasMore": true } }
```

---

## Health

`GET /health` → `{ "ok": true, "name": "devdeck", "uptime": 132, "env": "development" }`

---

## Auth

### `POST /auth/register`
```json
{ "name": "Alex Rivera", "email": "alex@example.dev", "password": "at-least-8-chars" }
```
`201` → `{ "token": "…", "user": { … } }`. A brand-new account is immediately seeded with sample projects,
tasks, notes, commands, services, repositories and activity.

### `POST /auth/login`
`200` → `{ token, user }`. `401` on bad credentials (same message for unknown email and wrong password).

### `POST /auth/demo`
Creates (once) and signs into the demo workspace. `200` → `{ token, user }`.

### `GET /auth/me`
`200` → `{ "user": { id, name, email, avatarColor, theme, defaultProjectId, prefs, createdAt } }`

### `PATCH /auth/me`
Any of `name`, `email`, `theme` (`light|dark|system`), `avatarColor`, `defaultProjectId`, `prefs`, `onboarded`.

### `POST /auth/me/password`
`{ "currentPassword": "…", "newPassword": "…" }` → `{ ok: true }`

### `DELETE /auth/me`
Deletes the account and all owned data (`ON DELETE CASCADE`).

---

## Dashboard

### `GET /dashboard`
Single aggregate call used by the overview screen:

```json
{
  "data": {
    "greeting": "Good morning",
    "stats": {
      "activeProjects": 4, "openTasks": 13, "tasksDueToday": 4, "tasksCompletedToday": 0,
      "overdueTasks": 0, "runningServices": 5, "totalServices": 7,
      "commandsToday": 5, "commandsFailedToday": 0, "commitsToday": 2, "commitsWeek": 40
    },
    "projects": [ { "id": "…", "name": "Nova Analytics", "counts": { "openTasks": 5, "doneTasks": 2, "notes": 2, "commands": 4, "runningServices": 3 } } ],
    "tasksDueToday": [ … ],
    "recentRuns": [ … ],
    "services": [ … ],
    "recentCommits": [ { "sha": "a1b2c3d", "message": "fix(ingest): …", "author": "Priya Nair", "date": "…" } ],
    "activity": [ … ],
    "week": [ { "date": "2026-11-06", "label": "Thu", "commands": 3, "tasks": 1, "commits": 2, "notes": 0, "total": 6 } ],
    "docker": { "connected": false, "message": "Docker daemon unreachable — showing tracked services." }
  }
}
```

---

## Projects

| Method | Path | Body / notes |
| --- | --- | --- |
| `GET` | `/projects` | `?status=active\|archived\|all`, `?q=`. Each item includes `counts` |
| `POST` | `/projects` | `{ name, description, techStack[], repoUrl, localPath, environment, color }` |
| `GET` | `/projects/:id` | Includes `tasks`, `notes`, `commands`, `services`, `activity` |
| `PATCH` | `/projects/:id` | Any subset; `status: "archived"` archives |
| `DELETE` | `/projects/:id` | Detaches associated records |

```json
{
  "name": "Nova Analytics",
  "description": "Real-time AI video analytics pipeline",
  "techStack": ["Python", "FastAPI", "PyTorch"],
  "repoUrl": "https://github.com/novalabs/nova-analytics",
  "localPath": "~/dev/nova-analytics",
  "environment": "staging",
  "color": "#6366f1"
}
```

---

## Tasks

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/tasks` | `status=todo,in_progress` · `priority=high,urgent` · `projectId` · `q` · `due=today\|overdue\|week` · `sort=position\|due_date\|priority\|created_at\|title` · `dir=asc\|desc` |
| `GET` | `/tasks/stats` | `{ total, done, in_progress, blocked, due_today, overdue }` |
| `POST` | `/tasks` | `{ title, description, priority, status, dueDate, projectId }` |
| `PATCH` | `/tasks/:id` | Setting `status: "done"` stamps `completedAt`; reopening clears it |
| `POST` | `/tasks/bulk` | `{ ids: [], status?: "done", priority?: "high", delete?: true }` |
| `DELETE` | `/tasks/:id` | |

Statuses: `todo`, `in_progress`, `blocked`, `done`. Priorities: `low`, `medium`, `high`, `urgent`.

---

## Commands & execution

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/commands` | `?q=`, `?projectId=`, `?tag=`. Each item carries `policy` (`allowed`, `dangerous`, `warnings`) plus run stats |
| `GET` | `/commands/policy` | Effective policy: `enabled`, `requireAllowlist`, `timeoutMs`, `maxOutputBytes`, `allowlist[]` |
| `POST` | `/commands/check` | `{ command }` → policy verdict without running |
| `POST` | `/commands` | `{ name, description, command, cwd, tags[], projectId, approved }` |
| `PATCH` | `/commands/:id` | |
| `DELETE` | `/commands/:id` | |
| `POST` | `/commands/run` | `{ commandId }` **or** `{ command, cwd, projectId, label, env, force }` → `202` `{ data: run, policy }` |
| `GET` | `/commands/runs` | `?status=`, `?q=`, paginated, newest first |
| `GET` | `/commands/runs/:id` | Full output + exit code + duration |
| `POST` | `/commands/runs/:id/cancel` | `SIGTERM`, then `SIGKILL` after 1.5s |
| `DELETE` | `/commands/runs/:id` | |

**Policy responses**

```json
// 400 — blocked outright
{ "error": "Piping remote scripts into a shell is blocked",
  "policy": { "allowed": false, "dangerous": true, "binary": "curl", "warnings": [ … ] } }

// 428 — needs confirmation
{ "error": "This command is flagged as dangerous and needs explicit confirmation",
  "requiresConfirmation": true,
  "policy": { "allowed": true, "dangerous": true, "warnings": ["Recursive delete"] } }
```

Re-send the same request with `force: true` to run a confirmed-dangerous command.

**Live output** arrives over the SSE stream:

```
event: command:output   data: { "runId": "…", "chunk": "…" }
event: command:done     data: { "runId": "…", "status": "success", "exitCode": 0, "durationMs": 3412, "output": "…" }
```

---

## Services

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/services` | `?status=running\|stopped\|error\|all`, `?projectId=`. `meta.dockerConnected` |
| `GET` | `/services/docker` | Live daemon probe + container list (`connected`, `host`, `message`, `containers[]`) |
| `POST` | `/services` | `{ name, kind, image, ports[], projectId, status }` |
| `PATCH` | `/services/:id` | |
| `POST` | `/services/:id/start`, `/stop`, `/restart`, `/inspect` | Attempts the real Docker action when the daemon is reachable, always updates tracked state |
| `DELETE` | `/services/:id` | |

`GET /services` response item:

```json
{
  "id": "…", "name": "nova-ingest", "kind": "docker", "image": "nova/ingest:1.8.2",
  "ports": ["8081:8081"], "status": "running", "cpu": 12.4, "memoryMb": 512,
  "startedAt": "…", "uptimeMs": 10800000, "projectName": "Nova Analytics"
}
```

Docker is reached over the socket at `DOCKER_HOST` — no CLI or native module required. When it is unreachable,
DevDeck serves the tracked service records so the UI keeps working (the response is explicit about it).

---

## GitHub

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/github/integration` | `{ provider, status, account, hasToken }` — never returns the token |
| `POST` | `/github/integration` | `{ token }` → verified against `GET /user`, then encrypted (AES-256-GCM) |
| `DELETE` | `/github/integration` | Disconnects and wipes the stored secret |
| `GET` | `/github/repos` | Linked repositories with cached snapshots |
| `POST` | `/github/repos` | `{ fullName: "owner/repo", projectId? }` |
| `GET` | `/github/repos/:id` | Full snapshot (`commits`, `branches`, `pullRequests`, `issues`, `contributors`) |
| `POST` | `/github/repos/:id/sync` | Pulls live data when a token exists |
| `DELETE` | `/github/repos/:id` | |
| `GET` | `/github/activity` | Aggregated commits / PRs / issues across linked repos |

Without a token DevDeck serves a realistic cached snapshot and labels `meta.live: false`.

---

## Notes

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/notes` | `?kind=note\|decision\|debug\|snippet\|doc`, `?tag=`, `?pinned=true`, `?projectId=`, `?q=`. Pinned first |
| `GET` | `/notes/tags` | `[{ tag, count }]` across the workspace |
| `GET` | `/notes/:id` | Includes `revisions[]` (last 20 snapshots) |
| `POST` | `/notes` | `{ title, body, tags[], kind, pinned, projectId }` |
| `PATCH` | `/notes/:id` | Changing `body` snapshots the previous version |
| `DELETE` | `/notes/:id` | |

Notes are stored as Markdown and rendered client-side.

---

## Search

### `GET /search?q=ingest&projectId=…&types=note,task`
FTS5-backed, grouped by entity with contextual snippets:

```json
{
  "data": {
    "total": 23,
    "results": [ { "id": "…", "entity": "note", "title": "ADR-014 · Bounded queue…", "snippet": "…bounded (maxsize=256) queue…", "projectId": "…", "updatedAt": "…" } ],
    "grouped": { "note": [ … ], "command": [ … ], "task": [ … ] }
  }
}
```

`GET /search/recent` → recently updated titles used for palette suggestions.

---

## Activity

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/activity` | `?type=command\|task\|commit\|note\|service\|project\|github\|auth` · `?projectId=` · `?from=` / `?to=` · `limit` (≤200) · `offset`. Returns `data[]` plus `groups[]` by day |
| `GET` | `/activity/summary?days=30` | `{ byType: { command: 6, task: 6, … }, total }` |
| `POST` | `/activity` | `{ title, description, type, projectId }` — manual timeline entry |

The server writes entries automatically for command runs, completed tasks, service actions, note creation,
project changes and GitHub syncs.

---

## Real-time stream

```
GET /events?token=<jwt>          (or Authorization: Bearer)
Accept: text/event-stream
```

```
retry: 3000

event: ready            data: { "userId": "…", "at": 1700000000000 }
event: activity:new     data: { "id": "…", "type": "command", "title": "Ran: pytest -q", … }
event: service:updated  data: { "id": "…", "status": "running", … }
event: command:output   data: { "runId": "…", "chunk": "collected 12 items\n" }
event: command:done     data: { "runId": "…", "status": "success", "exitCode": 0, "durationMs": 3412 }
```

Topics are per user; a payload can never reach another account's stream. A heartbeat comment every 25s keeps
proxies from closing idle connections.

---

## Settings & data

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/settings` | Profile, command policy, Docker status, GitHub status, record counts |
| `PATCH` | `/settings/prefs` | `{ prefs: { … } }` merged into the user record |
| `POST` | `/settings/policy/check` | Same as `/commands/check` |
| `GET` | `/settings/export` | Downloadable JSON of everything the user owns |
| `POST` | `/settings/import` | Merge a previous export (new ids, project links remapped) |
| `POST` | `/settings/reset` | Delete all workspace content, keep the account |

---

## OpenAPI

A machine-readable description lives in [`docs/openapi.yaml`](openapi.yaml). Point any OpenAPI viewer at it, or:

```bash
npx @redocly/cli preview-docs docs/openapi.yaml
```

## Postgres

The schema is plain SQL. To run on Postgres:

1. Set `DATABASE_URL` to a Postgres connection string.
2. Swap the `node:sqlite` adapter in `server/src/db/index.js` for `pg` (`query`, `all`, `get`, `run`).
3. Replace `TEXT` timestamps with `timestamptz`, `INTEGER` booleans with `boolean`, and `search_fts` with a
   `tsvector` + GIN index (`to_tsvector('english', title || ' ' || body)`).

Every query is parameterised and user-scoped, so no changes are needed above the adapter layer.
