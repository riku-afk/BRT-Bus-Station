/** Shared helpers for Bun scripts: plain `pg` clients (scripts are one-shot, no pool needed). */
import path from 'node:path';
import { Client } from 'pg';

export const databaseRoot = path.resolve(import.meta.dir, '..', '..', 'database');
export const databaseUrl = process.env.DATABASE_URL ?? 'postgres://postgres:password@localhost:5432/brt_bus_station';
export const appEnv = process.env.APP_ENV ?? 'local';

export async function withClient<T>(url: string, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url });
  await client.connect();
  client.on('notice', () => { });
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
