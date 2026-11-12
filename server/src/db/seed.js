/**
 * Workspace seeding. Every newly created account gets a realistic, lived-in
 * workspace: four projects, tasks across the week, command history with real
 * output, engineering notes, tracked services, linked repositories and an
 * activity timeline.
 */
import { randomUUID } from 'node:crypto';
import { run, get } from './index.js';
import { indexEntity } from './search.js';
import { hashPassword } from '../lib/auth.js';

const iso = (d) => new Date(d).toISOString();
const day = 86400000;
const ago = (ms) => new Date(Date.now() - ms);
const inDays = (n, hour = 17) => {
  const d = new Date(Date.now() + n * day);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const id = () => randomUUID();

export function seedWorkspace(userId) {
  const ts = iso(ago(30 * day));
  const projects = [
    {
      id: id(),
      name: 'Nova Analytics',
      slug: 'nova-analytics',
      description:
        'Real-time AI video analytics pipeline. Ingests RTSP streams, runs object detection on GPU workers, and publishes aggregated events to the dashboard.',
      tech_stack: ['Python', 'FastAPI', 'PyTorch', 'OpenCV', 'Redis', 'PostgreSQL'],
      repo_url: 'https://github.com/novalabs/nova-analytics',
      local_path: '~/dev/nova-analytics',
      environment: 'staging',
      status: 'active',
      color: '#6366f1',
      created_at: iso(ago(96 * day)),
      updated_at: iso(ago(2 * 3600000)),
    },
    {
      id: id(),
      name: 'Pulse Dashboard',
      slug: 'pulse-dashboard',
      description:
        'Operator dashboard for Nova. React + TypeScript front-end with live WebSocket feeds, incident timelines and per-camera drill-downs.',
      tech_stack: ['React', 'TypeScript', 'Vite', 'Tailwind CSS', 'Zustand', 'Recharts'],
      repo_url: 'https://github.com/novalabs/pulse-dashboard',
      local_path: '~/dev/pulse-dashboard',
      environment: 'local',
      status: 'active',
      color: '#0ea5e9',
      created_at: iso(ago(72 * day)),
      updated_at: iso(ago(50 * 60000)),
    },
    {
      id: id(),
      name: 'Atlas API',
      slug: 'atlas-api',
      description:
        'FastAPI service that owns tenant metadata, billing events and the public REST surface consumed by the Pulse dashboard.',
      tech_stack: ['Python', 'FastAPI', 'SQLAlchemy', 'Alembic', 'PostgreSQL', 'Docker'],
      repo_url: 'https://github.com/novalabs/atlas-api',
      local_path: '~/dev/atlas-api',
      environment: 'production',
      status: 'active',
      color: '#10b981',
      created_at: iso(ago(140 * day)),
      updated_at: iso(ago(1 * day)),
    },
    {
      id: id(),
      name: 'Personal Portfolio',
      slug: 'personal-portfolio',
      description: 'Personal site with writing, project case studies and a small MDX blog.',
      tech_stack: ['Next.js', 'MDX', 'Tailwind CSS', 'Vercel'],
      repo_url: 'https://github.com/alexrivera/portfolio',
      local_path: '~/dev/portfolio',
      environment: 'production',
      status: 'active',
      color: '#f59e0b',
      created_at: iso(ago(200 * day)),
      updated_at: iso(ago(6 * day)),
    },
    {
      id: id(),
      name: 'ML Playground',
      slug: 'ml-playground',
      description: 'Scratch space for model experiments, notebooks and dataset wrangling.',
      tech_stack: ['Jupyter', 'Pandas', 'scikit-learn'],
      repo_url: null,
      local_path: '~/dev/ml-playground',
      environment: 'sandbox',
      status: 'archived',
      color: '#8b5cf6',
      created_at: iso(ago(300 * day)),
      updated_at: iso(ago(90 * day)),
    },
  ];

  for (const p of projects) {
    run(
      `INSERT INTO projects (id, user_id, name, slug, description, tech_stack, repo_url, local_path, environment, status, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      p.id,
      userId,
      p.name,
      p.slug,
      p.description,
      JSON.stringify(p.tech_stack),
      p.repo_url,
      p.local_path,
      p.environment,
      p.status,
      p.color,
      p.created_at,
      p.updated_at
    );
    indexEntity('project', {
      id: p.id,
      user_id: userId,
      project_id: p.id,
      title: p.name,
      body: `${p.description}\n${p.tech_stack.join(' ')}\n${p.local_path}`,
      updated_at: p.updated_at,
    });
  }
  const [nova, pulse, atlas, portfolio] = projects;

  /* ---------------------------------------------------------------- tasks */
  const tasks = [
    // Nova
    { p: nova, t: 'Fix dropped frames in RTSP ingest worker', d: 'Frames are occasionally dropped when a camera reconnects. Likely the buffer flush in `stream_reader.py` racing with the reconnect handler.', pr: 'urgent', s: 'in_progress', due: inDays(0, 16) },
    { p: nova, t: 'Add GPU memory watermark to worker health check', d: 'Workers silently OOM above 92% VRAM. Emit a `gpu_memory_pct` gauge and page when it stays above 90% for 5 minutes.', pr: 'high', s: 'todo', due: inDays(1) },
    { p: nova, t: 'Benchmark YOLOv9 vs YOLOv8 on the parking-lot dataset', d: 'Compare mAP50 and inference latency at batch sizes 1/4/8 on the T4 node.', pr: 'medium', s: 'todo', due: inDays(3) },
    { p: nova, t: 'Document the model registry promotion flow', d: 'Write up how a candidate model moves from staging to production, including the rollback steps.', pr: 'low', s: 'todo', due: inDays(6) },
    { p: nova, t: 'Migrate event schema to Protobuf', d: 'JSON events are ~4x larger than they need to be. Protobuf would cut Redis egress meaningfully.', pr: 'medium', s: 'blocked', due: inDays(9) },
    { p: nova, t: 'Reduce ingest latency below 250ms p95', d: 'Added a bounded queue between the reader and the detector pool.', pr: 'high', s: 'done', due: inDays(-2) },
    { p: nova, t: 'Upgrade CUDA runtime to 12.4', d: '', pr: 'low', s: 'done', due: inDays(-5) },

    // Pulse
    { p: pulse, t: 'Add keyboard shortcuts to the incident timeline', d: 'j/k to move between events, Enter to open the detail drawer.', pr: 'medium', s: 'in_progress', due: inDays(0, 18) },
    { p: pulse, t: 'Virtualize the camera grid (200+ streams)', d: 'Rendering 240 live players at once drops frames badly. Switch to windowed rendering.', pr: 'high', s: 'todo', due: inDays(2) },
    { p: pulse, t: 'Dark-mode audit of the fleet map', d: 'Two of the overlays are unreadable against the dark basemap.', pr: 'low', s: 'todo', due: inDays(4) },
    { p: pulse, t: 'Replace polling with SSE for service status', d: 'We poll every 5s; the backend already emits events.', pr: 'medium', s: 'done', due: inDays(-1) },
    { p: pulse, t: 'Write Storybook stories for the empty states', d: '', pr: 'low', s: 'done', due: inDays(-4) },

    // Atlas
    { p: atlas, t: 'Rotate the Postgres read replica credentials', d: 'Scheduled quarterly rotation. Update the secret in the deploy pipeline afterwards.', pr: 'urgent', s: 'todo', due: inDays(0, 14) },
    { p: atlas, t: 'Add idempotency keys to the billing webhook', d: 'Stripe retries are creating duplicate invoice rows.', pr: 'urgent', s: 'in_progress', due: inDays(0, 15) },
    { p: atlas, t: 'Backfill tenant.created_at for legacy rows', d: 'Rows created before the 2024 migration have NULL timestamps.', pr: 'medium', s: 'blocked', due: inDays(7) },
    { p: atlas, t: 'Cut p95 latency on /v1/events', d: 'Added a covering index and removed an N+1 in the serializer. p95 380ms → 94ms.', pr: 'high', s: 'done', due: inDays(-3) },
    { p: atlas, t: 'Publish OpenAPI docs at /docs', d: '', pr: 'low', s: 'done', due: inDays(-8) },

    // Portfolio
    { p: portfolio, t: 'Write the Nova Analytics case study', d: 'Focus on the ingest architecture and the latency work.', pr: 'medium', s: 'todo', due: inDays(5) },
    { p: portfolio, t: 'Fix RSS feed ordering', d: 'Posts come out in publish order, not date order.', pr: 'low', s: 'todo', due: inDays(11) },
    { p: portfolio, t: 'Add reading time to post headers', d: '', pr: 'low', s: 'done', due: inDays(-12) },
  ];

  tasks.forEach((task, i) => {
    const taskId = id();
    const createdAt = iso(ago((20 - (i % 12)) * day));
    run(
      `INSERT INTO tasks (id, user_id, project_id, title, description, priority, status, due_date, completed_at, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      taskId,
      userId,
      task.p.id,
      task.t,
      task.d,
      task.pr,
      task.s,
      task.due,
      task.s === 'done' ? iso(ago(Math.abs(task.due ? (Date.parse(task.due) - Date.now()) : 2 * day) + 3600000)) : null,
      i + 1,
      createdAt,
      iso(ago(3600000))
    );
    indexEntity('task', {
      id: taskId,
      user_id: userId,
      project_id: task.p.id,
      title: task.t,
      body: `${task.d}\nstatus: ${task.s} priority: ${task.pr}`,
      updated_at: iso(ago(3600000)),
    });
  });

  /* ------------------------------------------------------------- commands */
  const commands = [
    { p: nova, n: 'Start detector worker', c: 'python -m nova.worker --queue detection --concurrency 4', cwd: '~/dev/nova-analytics', tags: ['worker', 'python'], a: 1, d: 'Boots the detection worker against the local Redis queue.' },
    { p: nova, n: 'Tail ingest logs', c: 'docker logs -f nova-ingest --tail 100', cwd: '~/dev/nova-analytics', tags: ['logs', 'docker'], a: 1, d: 'Follow the ingest container output in real time.' },
    { p: nova, n: 'Run ingest test suite', c: 'pytest tests/ingest -q', cwd: '~/dev/nova-analytics', tags: ['test', 'pytest'], a: 1, d: 'Fast unit tests for the stream reader and reconnection logic.' },
    { p: nova, n: 'Rebuild GPU worker image', c: 'docker build -t nova/worker:dev -f docker/worker.Dockerfile .', cwd: '~/dev/nova-analytics', tags: ['docker', 'build'], a: 0, d: 'Rebuild after changing CUDA or Python dependencies.' },
    { p: pulse, n: 'Dev server', c: 'npm run dev', cwd: '~/dev/pulse-dashboard', tags: ['dev', 'vite'], a: 1, d: 'Vite dev server with HMR on port 5173.' },
    { p: pulse, n: 'Type check', c: 'npx tsc --noEmit', cwd: '~/dev/pulse-dashboard', tags: ['typescript', 'check'], a: 1, d: 'Full project type check without emitting files.' },
    { p: pulse, n: 'Lint + fix', c: 'npx eslint src --ext .ts,.tsx --fix', cwd: '~/dev/pulse-dashboard', tags: ['lint'], a: 1, d: '' },
    { p: pulse, n: 'Build production bundle', c: 'npm run build', cwd: '~/dev/pulse-dashboard', tags: ['build'], a: 1, d: 'Vite production build into dist/.' },
    { p: atlas, n: 'Run migrations', c: 'alembic upgrade head', cwd: '~/dev/atlas-api', tags: ['db', 'alembic'], a: 1, d: 'Apply pending Alembic migrations.' },
    { p: atlas, n: 'Start API with reload', c: 'uvicorn app.main:app --reload --port 8000', cwd: '~/dev/atlas-api', tags: ['dev', 'fastapi'], a: 1, d: '' },
    { p: atlas, n: 'Open psql session', c: 'psql -h localhost -U atlas -d atlas_dev', cwd: '~/dev/atlas-api', tags: ['db'], a: 0, d: 'Interactive session against the local dev database.' },
    { p: atlas, n: 'Run the full test suite', c: 'pytest -q', cwd: '~/dev/atlas-api', tags: ['test'], a: 1, d: '' },
    { p: portfolio, n: 'Deploy preview', c: 'npx vercel --prod', cwd: '~/dev/portfolio', tags: ['deploy'], a: 0, d: 'Publishes the production build.' },
    { p: null, n: 'Check disk usage', c: 'df -h', cwd: '~', tags: ['system'], a: 0, d: '' },
    { p: null, n: 'List running containers', c: 'docker ps --format', cwd: '~', tags: ['docker'], a: 0, d: '' },
  ];

  const commandRows = commands.map((cmd) => {
    const cid = id();
    const createdAt = iso(ago(40 * day));
    run(
      `INSERT INTO commands (id, user_id, project_id, name, description, command, cwd, tags, approved, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      cid,
      userId,
      cmd.p?.id ?? null,
      cmd.n,
      cmd.d,
      cmd.c,
      cmd.cwd,
      JSON.stringify(cmd.tags),
      cmd.a,
      createdAt,
      iso(ago(3 * day))
    );
    indexEntity('command', {
      id: cid,
      user_id: userId,
      project_id: cmd.p?.id ?? null,
      title: cmd.n,
      body: `${cmd.c}\n${cmd.d}\n${cmd.tags.join(' ')}`,
      updated_at: createdAt,
    });
    return { ...cmd, id: cid };
  });

  /* --------------------------------------------------------- command runs */
  const outputs = {
    'Run ingest test suite': [
      '............                                   [100%]',
      '12 passed in 3.41s',
    ],
    'Type check': [''],
    'Lint + fix': [''],
    'Build production bundle': [
      'vite v5.4.11 building for production...',
      'transforming...',
      '✓ 421 modules transformed.',
      'dist/index.html                   0.62 kB │ gzip:  0.38 kB',
      'dist/assets/index-Bd2f9a.css     38.41 kB │ gzip:  6.72 kB',
      'dist/assets/index-C0a71e.js     284.19 kB │ gzip: 91.42 kB',
      '✓ built in 4.82s',
    ],
    'Tail ingest logs': [
      '2025-11-12 09:41:02 INFO  ingest.stream  camera=lot-north fps=29.8 dropped=0',
      '2025-11-12 09:41:03 INFO  ingest.stream  camera=lot-south fps=29.4 dropped=2',
      '2025-11-12 09:41:03 WARN  ingest.stream  camera=gate-east reconnect attempt 1/5',
      '2025-11-12 09:41:04 INFO  ingest.stream  camera=gate-east reconnected in 812ms',
    ],
    'Run migrations': [
      'INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.',
      'INFO  [alembic.runtime.migration] Will assume transactional DDL.',
      'INFO  [alembic.runtime.migration] Running upgrade 4f1c9a → 7b2e0df, add idempotency keys',
    ],
    'Dev server': [
      '  VITE v5.4.11  ready in 312 ms',
      '  ➜  Local:   http://localhost:5173/',
      '  ➜  Network: http://192.168.1.24:5173/',
    ],
    'Run the full test suite': [
      '...........................................                              [100%]',
      '43 passed, 2 skipped in 11.28s',
    ],
    'Start detector worker': [
      'INFO nova.worker  queue=detection concurrency=4 model=yolov9-c',
      'INFO nova.worker  connected to redis://localhost:6379/0',
      'INFO nova.worker  waiting for jobs…',
    ],
    'Check disk usage': [
      'Filesystem      Size  Used Avail Use% Mounted on',
      '/dev/nvme0n1p2  931G  612G  272G  70% /',
    ],
    'List running containers': [
      'nova-ingest   Up 3 hours   0.0.0.0:8081->8081/tcp',
      'nova-redis    Up 3 hours   6379/tcp',
    ],
  };

  const runsPlan = [
    { cmd: 'Run ingest test suite', status: 'success', code: 0, ms: 3412, h: 1 },
    { cmd: 'Tail ingest logs', status: 'cancelled', code: null, ms: 18240, h: 2 },
    { cmd: 'Dev server', status: 'cancelled', code: null, ms: 45010, h: 3 },
    { cmd: 'Type check', status: 'success', code: 0, ms: 6210, h: 4 },
    { cmd: 'Build production bundle', status: 'success', code: 0, ms: 4820, h: 5 },
    { cmd: 'Run migrations', status: 'success', code: 0, ms: 1284, h: 7 },
    { cmd: 'Run the full test suite', status: 'failed', code: 1, ms: 11280, h: 8, extra: 'E   AssertionError: expected 200, got 502\n=========================== short test summary info ============================\nFAILED tests/test_billing.py::test_webhook_retry_is_idempotent' },
    { cmd: 'Start detector worker', status: 'success', code: 0, ms: 902, h: 9 },
    { cmd: 'Lint + fix', status: 'success', code: 0, ms: 2210, h: 22 },
    { cmd: 'Check disk usage', status: 'success', code: 0, ms: 42, h: 25 },
    { cmd: 'Run the full test suite', status: 'success', code: 0, ms: 11020, h: 26 },
    { cmd: 'List running containers', status: 'success', code: 0, ms: 88, h: 28 },
    { cmd: 'Run ingest test suite', status: 'success', code: 0, ms: 3290, h: 30 },
    { cmd: 'Build production bundle', status: 'success', code: 0, ms: 5010, h: 47 },
    { cmd: 'Run migrations', status: 'success', code: 0, ms: 1120, h: 49 },
    { cmd: 'Dev server', status: 'success', code: 0, ms: 3200, h: 52 },
    { cmd: 'Type check', status: 'failed', code: 2, ms: 7100, h: 54, extra: "src/components/CameraGrid.tsx(41,18): error TS2322: Type 'string | undefined' is not assignable to type 'string'." },
    { cmd: 'Run ingest test suite', status: 'success', code: 0, ms: 3110, h: 70 },
    { cmd: 'Start detector worker', status: 'success', code: 0, ms: 780, h: 72 },
    { cmd: 'Run the full test suite', status: 'success', code: 0, ms: 10440, h: 74 },
  ];

  for (const plan of runsPlan) {
    const cmd = commandRows.find((c) => c.n === plan.cmd);
    const startedAt = ago(plan.h * 3600000);
    const body = (outputs[plan.cmd] || ['']).join('\n');
    const output = plan.extra ? `${body}\n${plan.extra}` : body;
    const runId = id();
    run(
      `INSERT INTO command_runs (id, user_id, command_id, project_id, label, command, cwd, status, exit_code, output, duration_ms, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      runId,
      userId,
      cmd.id,
      cmd.p?.id ?? null,
      cmd.n,
      cmd.c,
      cmd.cwd,
      plan.status,
      plan.code,
      output,
      plan.ms,
      iso(startedAt),
      iso(new Date(startedAt.getTime() + plan.ms))
    );
    indexEntity('run', {
      id: runId,
      user_id: userId,
      project_id: cmd.p?.id ?? null,
      title: cmd.n,
      body: `${cmd.c}\n${output}`,
      updated_at: iso(startedAt),
    });
  }

  /* ---------------------------------------------------------------- notes */
  const notes = [
    {
      p: nova,
      title: 'ADR-014 · Bounded queue between ingest and detection',
      kind: 'decision',
      pinned: 1,
      tags: ['architecture', 'adr', 'performance'],
      body: `## Context

Ingest workers were pushing directly into the detector pool. During camera reconnects the reader produced bursts that starved the GPU workers and pushed p95 latency to **410 ms**.

## Decision

Insert a bounded (\`maxsize=256\`) queue between the reader and the detector pool. On overflow we drop the *oldest* frame and increment \`ingest.dropped_frames\` rather than blocking the reader.

## Consequences

- p95 ingest latency: 410 ms → **231 ms**
- Dropped frames are now a first-class metric we alert on
- Backpressure no longer propagates into the RTSP socket, which was causing reconnects`,
    },
    {
      p: nova,
      title: 'Debugging: GPU worker OOM on the T4 node',
      kind: 'debug',
      pinned: 0,
      tags: ['gpu', 'memory', 'debugging'],
      body: `**Symptom** — worker 3 trips the OOM killer every ~40 minutes under load.

**Investigation**

\`\`\`bash
docker stats --no-stream nova-worker-3
nvidia-smi --query-gpu=memory.used,memory.total --format=csv
\`\`\`

VRAM climbs steadily and never drops back — classic sign of tensors held in the loop.

**Root cause** — \`detect_batch()\` appended tensors to a module-level \`_cache\` list without clearing. Found it with \`torch.cuda.memory_allocated()\` deltas across iterations.

**Fix** — cache is now an \`OrderedDict\` bounded to 32 entries with an LRU eviction.`,
    },
    {
      p: pulse,
      title: 'Snippet: typed SSE hook',
      kind: 'snippet',
      pinned: 1,
      tags: ['react', 'typescript', 'snippet', 'sse'],
      body: `\`\`\`ts
export function useServerEvents<T>(onEvent: (name: string, data: T) => void) {
  useEffect(() => {
    const source = new EventSource('/api/events');
    const handler = (event: MessageEvent) => onEvent(event.type, JSON.parse(event.data));
    ['activity:new', 'service:updated', 'command:done'].forEach((name) =>
      source.addEventListener(name, handler as EventListener)
    );
    return () => source.close();
  }, [onEvent]);
}
\`\`\``,
    },
    {
      p: pulse,
      title: 'Camera grid performance notes',
      kind: 'note',
      pinned: 0,
      tags: ['performance', 'react'],
      body: `240 players = 240 \`<video>\` elements. Even behind \`loading="lazy"\` the browser keeps decoders warm.

- Moving to a windowed list (only render ~12 tiles) restored 60fps
- Pause off-screen streams at the HLS level instead of muting them
- Avoid layout thrash: fixed aspect ratio boxes, no flex recalculation on hover`,
    },
    {
      p: atlas,
      title: 'Incident 2025-11-04 · duplicate invoice rows',
      kind: 'debug',
      pinned: 0,
      tags: ['incident', 'billing', 'postgres'],
      body: `Stripe retried \`invoice.paid\` 4 times during a 30-minute window; we inserted a row per delivery.

**Timeline**

- 14:02 first duplicate detected by finance
- 14:11 reproduced locally by replaying the webhook payload
- 14:38 shipped \`Idempotency-Key\` handling keyed on \`event.id\`
- 15:05 cleaned up 212 duplicate rows with a targeted delete

**Follow-up** — add a UNIQUE constraint on \`billing_events(provider_event_id)\` so this is impossible at the database level.`,
    },
    {
      p: atlas,
      title: 'Deployment runbook',
      kind: 'doc',
      pinned: 0,
      tags: ['runbook', 'deploy', 'ops'],
      body: `## Deploy checklist

1. \`make test\` — all green
2. Tag the release: \`git tag -a v1.x.y -m "release"\`
3. Push the tag — CI builds and publishes the image
4. Apply migrations **before** rolling the deployment
5. Watch \`/healthz\` and the p95 latency panel for 10 minutes
6. Rollback: \`kubectl rollout undo deploy/atlas-api\``,
    },
    {
      p: portfolio,
      title: 'Post ideas backlog',
      kind: 'note',
      pinned: 0,
      tags: ['writing'],
      body: `- How we cut video ingest latency by 44%
- A pragmatic guide to command allowlists for internal tools
- Why I keep a local-first engineering cockpit
- Postgres index types I actually use`,
    },
    {
      p: null,
      title: 'Machine setup — new laptop',
      kind: 'note',
      pinned: 0,
      tags: ['setup', 'dotfiles'],
      body: `\`\`\`bash
brew install fnm pnpm docker postgresql@16
fnm install 22 && fnm default 22
git config --global user.email "alex@example.dev"
\`\`\`

Still need: GPG key for commit signing, 1Password CLI, Tailscale.`,
    },
  ];

  notes.forEach((note, i) => {
    const noteId = id();
    const createdAt = iso(ago((25 - i * 2) * day));
    run(
      `INSERT INTO notes (id, user_id, project_id, title, body, tags, kind, pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      noteId,
      userId,
      note.p?.id ?? null,
      note.title,
      note.body,
      JSON.stringify(note.tags),
      note.kind,
      note.pinned,
      createdAt,
      iso(ago((i + 1) * 6 * 3600000))
    );
    indexEntity('note', {
      id: noteId,
      user_id: userId,
      project_id: note.p?.id ?? null,
      title: note.title,
      body: `${note.body}\n${note.tags.join(' ')}`,
      updated_at: iso(ago((i + 1) * 6 * 3600000)),
    });
  });

  /* ------------------------------------------------------------- services */
  const services = [
    { p: nova, name: 'nova-ingest', kind: 'docker', image: 'nova/ingest:1.8.2', ports: ['8081:8081', '1935:1935'], status: 'running', cpu: 12.4, mem: 512, started: 3 },
    { p: nova, name: 'nova-redis', kind: 'docker', image: 'redis:7.2-alpine', ports: ['6379:6379'], status: 'running', cpu: 1.2, mem: 84, started: 30 },
    { p: nova, name: 'nova-postgres', kind: 'database', image: 'postgres:16', ports: ['5432:5432'], status: 'running', cpu: 3.8, mem: 246, started: 72 },
    { p: pulse, name: 'pulse-vite', kind: 'process', image: null, ports: ['5173:5173'], status: 'running', cpu: 2.1, mem: 176, started: 1 },
    { p: atlas, name: 'atlas-api', kind: 'docker', image: 'atlas/api:2.4.0', ports: ['8000:8000'], status: 'running', cpu: 6.6, mem: 318, started: 5 },
    { p: atlas, name: 'atlas-worker', kind: 'docker', image: 'atlas/worker:2.4.0', ports: [], status: 'stopped', cpu: 0, mem: 0 },
    { p: portfolio, name: 'portfolio-preview', kind: 'process', image: null, ports: ['3000:3000'], status: 'error', cpu: 0, mem: 0 },
  ];

  for (const svc of services) {
    const sid = id();
    const startedAt =
      svc.status === 'running' ? iso(ago(svc.started * 3600000)) : svc.status === 'error' ? iso(ago(2 * 3600000)) : null;
    run(
      `INSERT INTO services (id, user_id, project_id, name, kind, container_id, image, ports, status, cpu, memory_mb, started_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      sid,
      userId,
      svc.p?.id ?? null,
      svc.name,
      svc.kind,
      // Fake but well-formed 64-char container ids for demo mode.
      randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '').slice(0, 32),
      svc.image,
      JSON.stringify(svc.ports),
      svc.status,
      svc.cpu,
      svc.mem,
      startedAt,
      iso(ago(14 * day)),
      iso(ago(3600000))
    );
    indexEntity('service', {
      id: sid,
      user_id: userId,
      project_id: svc.p?.id ?? null,
      title: svc.name,
      body: `${svc.image || ''} ${svc.ports.join(' ')} ${svc.status}`,
      updated_at: iso(ago(3600000)),
    });
  }

  /* --------------------------------------------------------- github repos */
  const repoNames = [
    ['novalabs', 'nova-analytics'],
    ['novalabs', 'pulse-dashboard'],
    ['novalabs', 'atlas-api'],
    ['alexrivera', 'portfolio'],
  ];
  const commitMessages = [
    'fix(ingest): flush buffer before reconnect handshake',
    'perf(detector): bound frame queue to 256 entries',
    'feat(api): idempotency keys on billing webhook',
    'chore(deps): bump torch to 2.4.1',
    'feat(dashboard): live service status via SSE',
    'refactor(worker): extract model registry client',
    'test: cover reconnect edge case with a flaky camera',
    'docs: update deployment runbook',
    'fix(types): narrow camera config union',
    'feat(grid): windowed rendering for 200+ streams',
    'perf(sql): covering index on events(tenant_id, created_at)',
    'style: format with prettier 3.3',
    'feat(notes): version history snapshots',
    'fix(rss): sort posts by date not publish order',
    'ci: cache pnpm store between jobs',
  ];
  const branchesByRepo = [
    ['main', 'feat/bounded-frame-queue', 'fix/rtsp-reconnect', 'perf/gpu-watermark'],
    ['main', 'feat/windowed-grid', 'feat/keyboard-shortcuts', 'fix/dark-mode-map'],
    ['main', 'feat/idempotency-keys', 'chore/credential-rotation'],
    ['main', 'post/nova-case-study'],
  ];

  repoNames.forEach(([owner, name], idx) => {
    const rid = id();
    const projectId = projects[idx]?.id ?? null;
    const commits = Array.from({ length: 10 }).map((_, i) => ({
      sha: randomUUID().replace(/-/g, '').slice(0, 7),
      message: commitMessages[(idx * 3 + i) % commitMessages.length],
      author: pick(['Alex Rivera', 'Priya Nair', 'Marco Silva', 'Dana Kim']),
      date: iso(ago((i * 9 + idx * 3 + 2) * 3600000)),
      url: `https://github.com/${owner}/${name}/commit/abc`,
    }));
    const data = {
      commits,
      branches: branchesByRepo[idx].map((b) => ({
        name: b,
        sha: randomUUID().replace(/-/g, '').slice(0, 7),
      })),
      pullRequests:
        idx === 2
          ? []
          : [
              {
                number: 100 + idx * 7,
                title:
                  idx === 0
                    ? 'Bound the ingest→detector queue'
                    : idx === 1
                      ? 'Virtualize the camera grid'
                      : 'Add Nova case study',
                author: pick(['priya-nair', 'alexrivera', 'marcosilva']),
                url: `https://github.com/${owner}/${name}/pull/${100 + idx * 7}`,
                draft: idx === 1,
                updatedAt: iso(ago((idx + 1) * 5 * 3600000)),
              },
            ],
      issues: [
        {
          number: 210 + idx,
          title: idx === 0 ? 'Dropped frames when a camera reconnects' : idx === 1 ? 'Overlays unreadable in dark mode' : 'Legacy tenant rows missing timestamps',
          author: pick(['dana-kim', 'priya-nair']),
          url: `https://github.com/${owner}/${name}/issues/${210 + idx}`,
          labels: idx === 0 ? ['bug', 'ingest'] : idx === 1 ? ['ui'] : ['data'],
        },
      ],
      contributors: [
        { login: 'alexrivera', contributions: 214 - idx * 20, avatarUrl: null },
        { login: 'priya-nair', contributions: 143 - idx * 12, avatarUrl: null },
        { login: 'marcosilva', contributions: 87 - idx * 6, avatarUrl: null },
        { login: 'dana-kim', contributions: 41, avatarUrl: null },
      ],
    };
    run(
      `INSERT INTO github_repos (id, user_id, project_id, full_name, description, default_branch, language, stars, open_issues, open_prs, data, synced_at)
       VALUES (?, ?, ?, ?, ?, 'main', ?, ?, ?, ?, ?, ?)`,
      rid,
      userId,
      projectId,
      `${owner}/${name}`,
      projects[idx]?.description ?? '',
      ['Python', 'TypeScript', 'Python', 'TypeScript'][idx],
      [128, 64, 32, 12][idx],
      data.issues.length,
      data.pullRequests.length,
      JSON.stringify(data),
      iso(ago(20 * 60000))
    );
    indexEntity('repo', {
      id: rid,
      user_id: userId,
      project_id: projectId,
      title: `${owner}/${name}`,
      body: `${projects[idx]?.description ?? ''}\n${data.commits.map((c) => c.message).join('\n')}`,
      updated_at: iso(ago(20 * 60000)),
    });
  });

  run(
    `INSERT INTO integrations (id, user_id, provider, account, secret, config, status, created_at, updated_at)
     VALUES (?, ?, 'github', ?, NULL, ?, 'demo', ?, ?)
     ON CONFLICT(user_id, provider) DO UPDATE SET
       account = excluded.account, config = excluded.config, updated_at = excluded.updated_at`,
    id(),
    userId,
    'alexrivera',
    JSON.stringify({ avatarUrl: null, name: 'Alex Rivera', demo: true }),
    ts,
    iso(ago(2 * day))
  );

  /* ------------------------------------------------------------- activity */
  const activityPlan = [
    [1, 'commit', 'Pushed 3 commits to nova-analytics', 'fix(ingest): flush buffer before reconnect handshake', nova.id],
    [2, 'command', 'Ran: Run ingest test suite', 'pytest tests/ingest -q · exit 0 · 3412ms', nova.id],
    [3, 'service', 'Restarted nova-ingest', 'Container health check passed after restart', nova.id],
    [5, 'task', 'Completed task “Reduce ingest latency below 250ms p95”', 'Priority high', nova.id],
    [6, 'github', 'Opened pull request #107', 'Bound the ingest→detector queue', nova.id],
    [8, 'note', 'Updated note “ADR-014 · Bounded queue between ingest and detection”', '', nova.id],
    [10, 'command', 'Ran: Build production bundle', 'npm run build · exit 0 · 4820ms', pulse.id],
    [12, 'task', 'Completed task “Replace polling with SSE for service status”', 'Priority medium', pulse.id],
    [16, 'commit', 'Merged feat/windowed-grid into main', '11 files changed, +412 −96', pulse.id],
    [20, 'command', 'Ran: Run migrations', 'alembic upgrade head · exit 0 · 1284ms', atlas.id],
    [22, 'commit', 'Committed to atlas-api', 'feat(api): idempotency keys on billing webhook', atlas.id],
    [24, 'task', 'Completed task “Cut p95 latency on /v1/events”', 'p95 380ms → 94ms', atlas.id],
    [26, 'note', 'Added note “Incident 2025-11-04 · duplicate invoice rows”', '', atlas.id],
    [30, 'command', 'Ran: Run the full test suite', 'pytest -q · exit 1 · 11280ms', atlas.id],
    [34, 'github', 'Synced alexrivera/portfolio', '1 branch, 0 open pull requests', portfolio.id],
    [38, 'task', 'Created task “Write the Nova Analytics case study”', 'Priority medium', portfolio.id],
    [44, 'project', 'Archived project ML Playground', '', null],
    [52, 'command', 'Ran: List running containers', 'docker ps · exit 0 · 88ms', null],
    [60, 'service', 'Stopped atlas-worker', 'Container stopped by user', atlas.id],
    [72, 'task', 'Created task “Rotate the Postgres read replica credentials”', 'Priority urgent', atlas.id],
    [80, 'commit', 'Pushed 5 commits to pulse-dashboard', 'feat(dashboard): live service status via SSE', pulse.id],
    [96, 'note', 'Added note “Camera grid performance notes”', '', pulse.id],
    [120, 'command', 'Ran: Type check', 'npx tsc --noEmit · exit 2 · 7100ms', pulse.id],
    [144, 'task', 'Completed task “Publish OpenAPI docs at /docs”', '', atlas.id],
    [168, 'commit', 'Pushed 2 commits to portfolio', 'fix(rss): sort posts by date not publish order', portfolio.id],
  ];

  for (const [hours, type, title, description, projectId] of activityPlan) {
    const aid = id();
    const createdAt = iso(ago(hours * 3600000));
    run(
      `INSERT INTO activity (id, user_id, project_id, type, title, description, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, '{}', ?)`,
      aid,
      userId,
      projectId,
      type,
      title,
      description,
      createdAt
    );
    indexEntity('activity', {
      id: aid,
      user_id: userId,
      project_id: projectId,
      title,
      body: description,
      updated_at: createdAt,
    });
  }

  return { projects: projects.length, tasks: tasks.length, notes: notes.length, commands: commands.length };
}

/* --------------------------------------------------------------------------
 * CLI: `npm run seed` creates (or refreshes) the demo account.
 * ------------------------------------------------------------------------ */
export async function seedDemoUser() {
  const email = 'demo@devdeck.local';
  const password = 'devdeck123';
  let user = get('SELECT * FROM users WHERE email = ?', email);
  if (user) {
    for (const table of ['tasks', 'notes', 'commands', 'services', 'activity', 'github_repos', 'integrations', 'projects']) {
      run(`DELETE FROM ${table} WHERE user_id = ?`, user.id);
    }
    run('DELETE FROM command_runs WHERE user_id = ?', user.id);
    run('DELETE FROM search_index WHERE user_id = ?', user.id);
    run('DELETE FROM search_fts WHERE user_id = ?', user.id);
  } else {
    const userId = randomUUID();
    const ts = iso(new Date());
    run(
      `INSERT INTO users (id, email, password_hash, name, avatar_color, theme, prefs, onboarded, created_at, updated_at)
       VALUES (?, ?, ?, 'Alex Rivera', '#4f46e5', 'light', ?, 1, ?, ?)`,
      userId,
      email,
      hashPassword(password),
      JSON.stringify({ commandExecution: true, confirmDangerous: true, editor: 'markdown' }),
      ts,
      ts
    );
    user = get('SELECT * FROM users WHERE id = ?', userId);
  }
  const result = seedWorkspace(user.id);
  return { email, password, ...result };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { migrate } = await import('./migrate.js');
  migrate();
  const info = await seedDemoUser();
  // CLI command (`npm run seed`) — plain stdout is intentional here.
  process.stdout.write(
    `Seeded demo workspace for ${info.email} (password: ${info.password}) — ${info.projects} projects, ` +
      `${info.tasks} tasks, ${info.notes} notes, ${info.commands} saved commands.\n`
  );
}
