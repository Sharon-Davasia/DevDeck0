/**
 * Migration runner. Reads `schema.sql` plus ordered migrations in
 * `server/src/db/migrations/` and records applied ids in `schema_migrations`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, exec, all, run } from './index.js';
import { log } from './logger.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(dir, 'migrations');

export function migrate() {
  connect();
  exec(fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8'));
  const applied = new Set(all('SELECT id FROM schema_migrations').map((r) => r.id));

  if (fs.existsSync(migrationsDir)) {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const id = file.replace(/\.sql$/, '');
      if (applied.has(id)) continue;
      exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
      run(
        'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)',
        id,
        new Date().toISOString()
      );
      log.info(`applied migration ${id}`);
    }
  }
  return { applied: applied.size };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const res = migrate();
  log.info('migrations complete', res);
}
