/**
 * Controlled process runner: timeouts, output caps, cancellation and
 * per-run streamed output broadcast over SSE.
 */
import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { run, get } from '../db/index.js';
import { newId, now } from './http.js';
import { broadcast } from './realtime.js';
import { evaluateCommand } from './commandPolicy.js';
import { log } from '../db/logger.js';
import { recordActivity } from './activity.js';

const active = new Map(); // runId -> { child, timer }

function safeEnv(extra = {}) {
  const allow = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TZ', 'NODE_ENV', 'SHELL', 'TERM'];
  const env = {};
  for (const key of allow) if (process.env[key]) env[key] = process.env[key];
  for (const [k, v] of Object.entries(extra)) {
    if (/^[A-Z_][A-Z0-9_]*$/i.test(k) && v != null) env[k] = String(v);
  }
  return { ...env, CI: '1', FORCE_COLOR: '0' };
}

export function cancelRun(userId, runId) {
  const entry = active.get(runId);
  if (!entry) return false;
  entry.cancelled = true;
  try {
    entry.child.kill('SIGTERM');
    setTimeout(() => {
      try {
        entry.child.kill('SIGKILL');
      } catch {}
    }, 1500).unref?.();
  } catch {}
  return true;
}

export function isRunning(runId) {
  return active.has(runId);
}

/**
 * Start a command. Returns immediately with the created run row; output and
 * completion are streamed via SSE (`command:output`, `command:done`).
 */
export function startRun(userId, { command, cwd, projectId, commandId, label, env, force }) {
  if (!config.commandExecution.enabled) {
    return { error: 'Command execution is disabled on this deployment', status: 403 };
  }
  const policy = evaluateCommand(command);
  if (!policy.allowed) return { error: policy.reason || 'Command blocked by policy', policy, status: 400 };
  if (policy.dangerous && !force) {
    return {
      error: 'This command is flagged as dangerous and needs explicit confirmation',
      policy,
      requiresConfirmation: true,
      status: 428,
    };
  }

  const id = newId();
  const startedAt = now();
  run(
    `INSERT INTO command_runs (id, user_id, command_id, project_id, label, command, cwd, status, output, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'running', '', ?)`,
    id,
    userId,
    commandId || null,
    projectId || null,
    label || command.slice(0, 80),
    command,
    cwd || null,
    startedAt
  );

  const started = Date.now();
  let output = '';
  let truncated = false;
  let settled = false;

  const child = spawn('/bin/sh', ['-c', command], {
    cwd: cwd && cwd !== '~' ? cwd : process.cwd(),
    env: safeEnv(env),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const timer = setTimeout(() => {
    cancelRun(userId, id);
    append(`\n[devdeck] command timed out after ${config.commandExecution.timeoutMs}ms\n`);
  }, config.commandExecution.timeoutMs);
  timer.unref?.();

  active.set(id, { child, timer });

  function append(chunk) {
    if (truncated) return;
    if (output.length + chunk.length > config.commandExecution.maxOutputBytes) {
      output += chunk.slice(0, config.commandExecution.maxOutputBytes - output.length);
      output += '\n[devdeck] output truncated\n';
      truncated = true;
    } else {
      output += chunk;
    }
    broadcast(userId, 'command:output', { runId: id, chunk });
  }

  const onData = (buf) => append(buf.toString('utf8'));
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('error', (err) => {
    append(`\n[devdeck] failed to start: ${err.message}\n`);
  });

  child.on('close', (code, signal) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    active.delete(id);
    const durationMs = Date.now() - started;
    const status = code === 0 ? 'success' : signal === 'SIGTERM' || signal === 'SIGKILL' ? 'cancelled' : 'failed';
    run(
      `UPDATE command_runs SET status = ?, exit_code = ?, output = ?, duration_ms = ?, finished_at = ? WHERE id = ? AND user_id = ?`,
      status,
      code,
      output,
      durationMs,
      now(),
      id,
      userId
    );
    broadcast(userId, 'command:done', {
      runId: id,
      status,
      exitCode: code,
      durationMs,
      output,
    });
    recordActivity(userId, {
      type: 'command',
      projectId,
      title: `${status === 'success' ? 'Ran' : status === 'cancelled' ? 'Cancelled' : 'Failed'}: ${label || command.slice(0, 60)}`,
      description: `${command}${code !== null ? ` · exit ${code}` : ''} · ${durationMs}ms`,
      meta: { runId: id, exitCode: code, durationMs },
    });
    log.debug({ runId: id, status, durationMs }, 'command finished');
  });

  return { run: get('SELECT * FROM command_runs WHERE id = ?', id), policy };
}
