import { build } from 'esbuild';
// Frontend modules are bundled (JSX); server modules stay external so their
// `import.meta.url`-relative paths (schema.sql, data dir) resolve correctly.
const externalServer = {
  name: 'external-server',
  setup(b) {
    b.onResolve({ filter: /^\.\.\/server\// }, (args) => ({ path: args.path, external: true }));
  },
};
await build({
  entryPoints: ['scripts/smoke.mjs'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'scripts/_smoke.bundle.mjs',
  packages: 'external',
  plugins: [externalServer],
  loader: { '.js': 'jsx', '.jsx': 'jsx' },
  jsx: 'automatic',
  logLevel: 'error',
});
console.log('bundled');
