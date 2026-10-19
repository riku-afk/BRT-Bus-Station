/**
 * Apply database migrations, tracking each file with a SHA-256 checksum.
 *
 *   1. database/schema/<domain> on a fresh install, then database/updates.
 *   2. Seeds (database/seeds/standard): idempotent, applied on every run.
 *
 * Usage:
 *   bun run db:migrate            apply anything not yet applied
 *   bun run db:migrate:fresh      local/demo only: drop the public schema and rebuild
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Client } from 'pg';
import { appEnv, databaseRoot, databaseUrl, withClient } from './lib/db';

/** Domain order for fresh installs. Add new domains here as they are created. */
const SCHEMA_DOMAINS = ['prerequisites', 'identity', 'stations', 'fares', 'fleet', 'tickets', 'payments', 'scans', 'tracking'] as const;

const fresh = process.argv.includes('--fresh');
if (fresh && !['local', 'demo'].includes(appEnv)) {
  console.error(`--fresh is only allowed when APP_ENV is local or demo (current: ${appEnv}).`);
  process.exit(1);
}

type MigrationFile = { id: string; fullPath: string };

const sqlFiles = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.sql')).sort() : []);
const checksum = (content: string) => createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex');
const files = (dir: string, prefix: string): MigrationFile[] =>
  sqlFiles(path.join(databaseRoot, dir)).map((f) => ({ id: `${prefix}/${f}`, fullPath: path.join(databaseRoot, dir, f) }));

async function applyTracked(client: Client, list: MigrationFile[]): Promise<number> {
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const applied = new Map((await client.query<{ id: string; checksum: string }>('SELECT id, checksum FROM schema_migrations')).rows.map((r) => [r.id, r.checksum]));
  // Schema files only run on a never-migrated install; afterwards changes ship as database/updates.
  const isFreshInstall = ![...applied.keys()].some((id) => id.startsWith('schema/'));

  let count = 0;
  for (const file of list) {
    const content = readFileSync(file.fullPath, 'utf8');
    const sum = checksum(content);
    const previous = applied.get(file.id);
    if (previous) {
      if (previous !== sum) throw new Error(`${file.id} changed after it was applied. Add a new file under database/updates instead.`);
      continue;
    }
    if (file.id.startsWith('schema/') && !isFreshInstall) {
      console.warn(`skip ${file.id} (existing database — ship this change as database/updates/NNN-*.sql)`);
      continue;
    }
    try {
      await client.query('BEGIN');
      await client.query(content);
      await client.query('INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)', [file.id, sum]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`${file.id}: ${(err as Error).message}`);
    }
    console.log(`applied ${file.id}`);
    count++;
  }
  return count;
}

await withClient(databaseUrl, async (client) => {
  if (fresh) {
    console.log('--fresh: dropping and recreating the public schema');
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  }

  const schema = SCHEMA_DOMAINS.flatMap((domain) => files(path.join('schema', domain), `schema/${domain}`));
  const updates = files('updates', 'updates');
  const applied = await applyTracked(client, [...schema, ...updates]);

  // Seeds are idempotent and re-applied on every run (not tracked).
  for (const seed of files(path.join('seeds', 'standard'), 'seeds/standard')) {
    await client.query(readFileSync(seed.fullPath, 'utf8'));
  }
  console.log(applied === 0 ? 'database is up to date' : `applied ${applied} file(s)`);
});
