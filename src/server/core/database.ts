/**
 * Database Connection
 *
 * Lazily created PostgreSQL pool shared by the API and workers (`pg`, raw SQL, no ORM).
 * Repositories receive a `SQLExecutor` so the same code runs inside or outside a transaction.
 */
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { env } from '@config/env';

export interface SQLExecutor {
  /** Run a parameterized query ($1, $2, …) and return the rows. */
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: readonly unknown[]): Promise<T[]>;
}

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: env.database.url,
      max: env.database.poolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    pool.on('error', (err) => console.error(`[db] idle client error: ${err.message}`));
  }
  return pool;
}

function wrap(runner: Pool | PoolClient): SQLExecutor {
  return {
    async query<T extends QueryResultRow = QueryResultRow>(text: string, params?: readonly unknown[]) {
      const result = await runner.query<T>(text, params ? [...params] : undefined);
      return result.rows;
    },
  };
}

/** Executor for one-off queries outside a transaction. */
export function getDb(): SQLExecutor {
  return wrap(getPool());
}

export async function testConnection(): Promise<boolean> {
  try {
    const rows = await getDb().query('SELECT 1 AS ok');
    return rows.length === 1;
  } catch {
    return false;
  }
}

/** Run `callback` in a transaction; commits on return, rolls back on throw. */
export async function transaction<T>(callback: (tx: SQLExecutor) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(wrap(client));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
