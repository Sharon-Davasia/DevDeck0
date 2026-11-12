/**
 * Minimal structured JSON logger with level filtering and request context.
 */
import { config } from '../config.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
const threshold = LEVELS[config.logLevel] ?? 20;

function emit(level, fields, msg) {
  if ((LEVELS[level] ?? 20) < threshold) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields,
  };
  const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  if (config.env === 'production') {
    out.write(`${JSON.stringify(line)}\n`);
  } else {
    const { msg: m, ts, level: l, ...rest } = line;
    const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
    out.write(`${ts.slice(11, 23)} ${l.toUpperCase().padEnd(5)} ${m}${extra}\n`);
  }
}

function logger(fields = {}) {
  const make = (level) => (msg, extra) => emit(level, { ...fields, ...extra }, msg);
  return {
    debug: make('debug'),
    info: make('info'),
    warn: make('warn'),
    error: make('error'),
    child: (childFields) => logger({ ...fields, ...childFields }),
  };
}

export const log = logger();
