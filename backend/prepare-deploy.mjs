// Apply only additive test migrations during the connected Cloudflare build.
// Local development and local dry runs never touch the remote database.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (process.env.WORKERS_CI !== '1' || process.env.WRANGLER_COMMAND === 'dev') {
  console.log('Remote test migration skipped outside Workers Builds.');
} else {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  const binding = config.d1_databases?.find(item => item.binding === 'DB');
  if (config.name !== 'youfreetest' || binding?.database_name !== 'ufree-test-db' || binding?.database_id !== 'dff58bbe-1cc3-4850-8a58-4532fc9aed4b' || process.env.WORKERS_CI_BRANCH !== 'main') {
    throw new Error('Refusing remote migration outside the main test Worker/database configuration.');
  }
  const result = spawnSync(process.execPath, [new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url).pathname, 'd1', 'migrations', 'apply', 'ufree-test-db', '--remote'], { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Test database migration failed. Worker deployment stopped; check the D1 permissions of the Workers Builds token.');
}
