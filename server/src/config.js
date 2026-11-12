import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const serverRoot = path.resolve(here, '..');
export const repoRoot = path.resolve(serverRoot, '..');

function bool(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || path.join(serverRoot, 'data', 'devdeck.db'),
  jwtSecret:
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === 'production'
      ? null
      : 'devdeck-local-development-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  logLevel: process.env.LOG_LEVEL || 'info',
  seedDemo: bool(process.env.SEED_DEMO, true),
  commandExecution: {
    enabled: bool(process.env.ENABLE_COMMAND_EXECUTION, true),
    timeoutMs: Number(process.env.COMMAND_TIMEOUT_MS || 20000),
    maxOutputBytes: Number(process.env.COMMAND_MAX_OUTPUT_BYTES || 262144),
    requireAllowlist: bool(process.env.COMMAND_REQUIRE_ALLOWLIST, true),
  },
  github: {
    token: process.env.GITHUB_TOKEN || '',
    oauthClientId: process.env.GITHUB_OAUTH_CLIENT_ID || '',
    oauthSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET || '',
  },
  docker: {
    host: process.env.DOCKER_HOST || 'unix:///var/run/docker.sock',
    enabled: bool(process.env.DOCKER_ENABLED, true),
  },
  webDist: path.join(repoRoot, 'web', 'dist'),
};

if (config.env === 'production' && !config.jwtSecret) {
  throw new Error(
    'JWT_SECRET must be set in production. Refusing to start with the development secret.'
  );
}
