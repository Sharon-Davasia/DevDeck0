/**
 * Database layer.
 *
 * Uses Node's built-in SQLite driver (`node:sqlite`, Node >= 22.5) so DevDeck
 * has zero native build dependencies — a single `npm install` works everywhere.
 *
 * A small adapter exposes a familiar `.prepare().get()/.all()/.run()` API so the
 * rest of the codebase stays storage-agnostic.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { log } from './logger.js';

let raw = null;
export let dbPath = config.databaseUrl;

const booleanColumns = new Map();

function normaliseTable(table) {
  // node:sqlite returns null-prototype objects; convert to plain objects.
  return table;
}

export function connect(file = config.databaseUrl) {
  if (raw) return raw;
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  }
  raw = new DatabaseSync(file);
  dbPath = file;
  raw.exec('PRAGMA journal_mode = WAL;');
  raw.exec('PRAGMA foreign_keys = ON;');
  raw.exec('PRAGMA busy_timeout = 5000;');
  log.debug({ file }, 'database connected');
  return raw;
}

export function conn() {
  if (!raw) connect();
  return raw;
}

function toParams(params) {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p instanceof Date) return p.toISOString();
    if (p !== null && typeof p === 'object') return JSON.stringify(p);
    return p;
  });
}

function clean(row) {
  if (!row) return row;
  return { ...row };
}

/** Run a query returning a single row (or undefined). */
export function get(sql, ...params) {
  const row = conn().prepare(sql).get(...toParams(params));
  return row ? clean(normaliseTable(row)) : undefined;
}

/** Run a query returning all rows. */
export function all(sql, ...params) {
  return conn()
    .prepare(sql)
    .all(...toParams(params))
    .map((r) => clean(normaliseTable(r)));
}

/** Execute a statement. Returns { changes, lastInsertRowid }. */
export function run(sql, ...params) {
  const res = conn().prepare(sql).run(...toParams(params));
  return {
    changes: Number(res.changes),
    lastInsertRowid: Number(res.lastInsertRowid),
  };
}

export function exec(sql) {
  conn().exec(sql);
}

/** Wrap a function in a transaction. */
export function tx(fn) {
  const database = conn();
  database.exec('BEGIN');
  try {
    const result = fn();
    database.exec('COMMIT');
    return result;
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }
}

export function close() {
  if (raw) {
    raw.close();
    raw = null;
  }
}

/** Escape a value for use inside a LIKE pattern. */
export function like(term) {
  return `%${String(term).replace(/[%_]/g, (m) => `\\${m}`)}%`;
}
