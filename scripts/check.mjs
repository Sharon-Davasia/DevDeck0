/**
 * Lightweight repository hygiene checks (no ESLint dependency needed):
 *   • every route module resolves and has a default export
 *   • server imports resolve
 *   • no stray console.log in server runtime code
 *   • .env.example documents every config key used in server/src/config.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;

const fail = (msg) => {
  failures += 1;
  console.error(`✗ ${msg}`);
};
const pass = (msg) => console.log(`✓ ${msg}`);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// ── 1. Page modules ─────────────────────────────────────────────────────────
const pagesDir = path.join(root, 'web/src/pages');
const pages = fs.readdirSync(pagesDir).filter((f) => f.endsWith('.jsx'));
for (const file of pages) {
  const src = fs.readFileSync(path.join(pagesDir, file), 'utf8');
  if (!/export default/.test(src)) fail(`web/src/pages/${file} has no default export`);
}
pass(`${pages.length} page modules export a component`);

// Every lazy() import in App.jsx must point at a real file.
const app = fs.readFileSync(path.join(root, 'web/src/App.jsx'), 'utf8');
const lazyImports = [...app.matchAll(/import\('\.\/([^']+)'\)/g)].map((m) => m[1]);
for (const rel of lazyImports) {
  if (!fs.existsSync(path.join(root, 'web/src', rel))) fail(`App.jsx lazy import missing: ${rel}`);
}
pass(`${lazyImports.length} lazy routes resolve`);

// ── 2. Server imports ───────────────────────────────────────────────────────
const serverFiles = walk(path.join(root, 'server/src')).filter((f) => f.endsWith('.js'));
for (const file of serverFiles) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/^import .* from '(\.[^']+)';$/gm)) {
    const target = path.resolve(path.dirname(file), m[1]);
    if (!fs.existsSync(target)) fail(`${path.relative(root, file)} imports missing ${m[1]}`);
  }
}
pass(`${serverFiles.length} server modules resolve their relative imports`);

// ── 3. No console.log in server runtime ─────────────────────────────────────
for (const file of serverFiles) {
  const src = fs.readFileSync(file, 'utf8');
  if (/^\s*console\.log\(/m.test(src)) {
    fail(`${path.relative(root, file)} uses console.log (use the structured logger)`);
  }
}
pass('server uses structured logging');

// ── 4. Env documentation ────────────────────────────────────────────────────
const config = fs.readFileSync(path.join(root, 'server/src/config.js'), 'utf8');
const envKeys = new Set([...config.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]));
const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
const missing = [...envKeys].filter((k) => !example.includes(k));
if (missing.length) fail(`.env.example is missing: ${missing.join(', ')}`);
else pass(`${envKeys.size} environment variables documented`);

// ── 5. Repo hygiene ─────────────────────────────────────────────────────────
for (const required of ['README.md', 'Dockerfile', 'docker-compose.yml', '.github/workflows/ci.yml']) {
  if (!fs.existsSync(path.join(root, required))) fail(`missing ${required}`);
}
pass('deployment files present');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
