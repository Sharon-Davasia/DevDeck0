/**
 * Command allowlist policy.
 *
 * DevDeck executes shell commands on the host it is running on, so everything
 * goes through this policy first:
 *   1. hard blocklist  → never allowed
 *   2. dangerous flags → allowed, but require explicit confirmation
 *   3. allowlist       → binary must be on the list (unless disabled by config)
 */
import { config } from '../config.js';

export const ALLOWED_BINARIES = [
  'npm', 'pnpm', 'yarn', 'npx', 'node', 'bun',
  'git', 'python', 'python3', 'pip', 'pip3', 'poetry', 'uv', 'pytest',
  'ls', 'cat', 'pwd', 'echo', 'grep', 'rg', 'find', 'head', 'tail', 'wc',
  'docker', 'docker-compose', 'kubectl', 'make', 'cargo', 'rustc', 'go', 'tsc',
  'curl', 'jq', 'ps', 'df', 'du', 'which', 'env', 'date', 'uname', 'sleep',
  'sqlite3', 'psql', 'alembic', 'celery', 'flask', 'django-admin', 'manage.py',
  'uvicorn', 'gunicorn', 'vitest', 'jest', 'eslint', 'prettier', 'mypy', 'ruff', 'black', 'isort',
  'next', 'turbo', 'tsx', 'nodemon', 'compose', 'htop', 'top', 'free', 'tree', 'diff', 'tar',
  'zip', 'unzip', 'nvidia-smi', 'journalctl', 'stat', 'sort', 'uniq', 'sed', 'awk', 'cut',
  'xargs', 'tee', 'touch', 'mkdir', 'cp', 'mv', 'open', 'code', 'vercel',
  // Destructive binaries stay on the allowlist so the UI can *offer* them, but
  // they always trip a DANGEROUS rule below and require explicit confirmation.
  'rm', 'rmdir', 'kill', 'pkill',
];

const BLOCKED = [
  { re: /\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)?\/(\s|$)/, reason: 'Refusing to delete from filesystem root' },
  { re: /\bmkfs(\.|\s)/, reason: 'Filesystem formatting is blocked' },
  { re: /\bdd\s+if=.*of=\/dev\//, reason: 'Raw device writes are blocked' },
  { re: /:\(\)\s*\{.*\}\s*;\s*:/, reason: 'Fork bombs are blocked' },
  { re: /\b(shutdown|reboot|halt|poweroff)\b/, reason: 'Host power commands are blocked' },
  { re: /\bchmod\s+-R\s+777\s+\//, reason: 'Recursive permission changes on root are blocked' },
  { re: /\b(curl|wget)\b[^|]*\|\s*(ba)?sh/, reason: 'Piping remote scripts into a shell is blocked' },
  { re: /\bgit\s+push\s+.*--force/, reason: 'Force pushes are blocked by policy' },
  { re: /\bsudo\b/, reason: 'sudo is not allowed' },
  { re: /\b(nc|netcat)\b.*-e\b/, reason: 'Reverse shells are blocked' },
];

const DANGEROUS = [
  { re: /\brm\s+-[a-zA-Z]*[rf]/, reason: 'Recursive delete' },
  { re: /\bdocker\s+(system|volume|image)\s+prune/, reason: 'Docker prune removes data' },
  { re: /\bdocker\s+rm\s+-f/, reason: 'Forced container removal' },
  { re: /\bgit\s+(reset\s+--hard|clean\s+-[a-zA-Z]*f)/, reason: 'Discards uncommitted work' },
  { re: /\b(drop|truncate)\s+(table|database)\b/i, reason: 'Destructive database statement' },
  { re: /\bdropdb\b|\bdrop\s+database\b/i, reason: 'Drops a database' },
  { re: />\s*\/dev\/sd/, reason: 'Raw disk write' },
  { re: /\bnpm\s+publish\b/, reason: 'Publishes a package publicly' },
  { re: /\bkill\s+-9/, reason: 'Force kills processes' },
  { re: /\bgit\s+push\b/, reason: 'Pushes to a remote repository' },
];

function firstBinary(command) {
  const trimmed = command.trim().replace(/^(\w+=\S+\s+)+/, '');
  const match = trimmed.match(/^([\w.@/-]+)/);
  return match ? match[1].split('/').pop() : '';
}

/**
 * @returns {{allowed:boolean, dangerous:boolean, reason?:string, binary:string, warnings:string[]}}
 */
export function evaluateCommand(command) {
  const text = String(command || '').trim();
  if (!text) return { allowed: false, dangerous: false, reason: 'Command is empty', binary: '', warnings: [] };

  for (const rule of BLOCKED) {
    if (rule.re.test(text)) {
      return { allowed: false, dangerous: true, reason: rule.reason, binary: firstBinary(text), warnings: [rule.reason] };
    }
  }

  const binary = firstBinary(text);
  const warnings = [];
  let dangerous = false;
  for (const rule of DANGEROUS) {
    if (rule.re.test(text)) {
      dangerous = true;
      warnings.push(rule.reason);
    }
  }

  // Allow multi-command strings as long as every segment's binary is allowed.
  const segments = text.split(/&&|\|\||;|\|/).map((s) => s.trim()).filter(Boolean);
  const disallowed = config.commandExecution.requireAllowlist
    ? segments.map(firstBinary).filter((b) => b && !ALLOWED_BINARIES.includes(b))
    : [];
  if (disallowed.length) {
    return {
      allowed: false,
      dangerous,
      binary,
      reason: `“${disallowed[0]}” is not on the command allowlist`,
      warnings,
    };
  }

  return { allowed: true, dangerous, reason: null, binary, warnings };
}
