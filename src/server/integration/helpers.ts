/**
 * Integration-test harness: a dedicated `<database>_test` database, rebuilt from the migrations once per file.
 * Never touches the development database. Call `setupTestApp()` in `beforeAll`.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { Client } from 'pg';

const root = path.resolve(import.meta.dirname, '..', '..', '..');

export function testDatabaseUrl(): string {
  const base = new URL(process.env.DATABASE_URL ?? 'postgres://postgres:password@localhost:5432/brt_bus_station');
  const name = decodeURIComponent(base.pathname.replace(/^\//, ''));
  base.pathname = `/${name.endsWith('_test') ? name : `${name}_test`}`;
  return base.toString();
}

/** The shared secret the test app trusts for SSO tokens. */
export const TEST_SSO_SECRET = 'test-sso-shared-secret-0123456789abcdef';

export async function setupTestApp() {
  const url = testDatabaseUrl();
  const admin = new URL(url);
  const dbName = decodeURIComponent(admin.pathname.replace(/^\//, ''));
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (!exists.rowCount) await client.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await client.end();
  }

  execFileSync('bun', ['run', 'scripts/migrate.ts', '--fresh'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url, APP_ENV: 'local' },
    stdio: 'pipe',
  });

  // The app reads its environment at import time, so point it at the test database first.
  process.env.DATABASE_URL = url;
  // Deterministic simulator: 2 line buses, very fast, no dwell, so a trip finishes within a second or two.
  process.env.SIM_BUS_COUNT = '2';
  process.env.SIM_SPEED_KMH = '3600';
  process.env.SIM_DWELL_SECONDS = '0';
  // Tests never depend on the developer's .env payment settings: the mock gateway unless a test switches provider itself,
  // and never real PisoPay credentials or a real gateway URL.
  process.env.PAYMENT_PROVIDER = 'mock';
  // And never a real routing service: straight lines unless a test stores road geometry itself.
  process.env.ROUTING_PROVIDER = 'none';
  // Nothing is ever really emailed from a test.
  process.env.MAIL_PROVIDER = 'console';
  // Single sign-on is on in tests, with a known secret (src/server/integration/sso.integration.test.ts signs tokens with it).
  process.env.SSO_ENABLED = 'true';
  process.env.SSO_SHARED_SECRET = TEST_SSO_SECRET;
  delete process.env.PISOPAY_API_USERNAME;
  delete process.env.PISOPAY_API_PASSWORD;
  process.env.PISOPAY_BASE_URL = 'https://api-checkout.pisopay.test';
  const { api } = await import('../index');
  const db = await import('@core/database');
  return { api, db, close: () => db.closeDatabase() };
}

/** Loosely typed response body for assertions. */
// Test assertions poke at arbitrary response shapes, so data is deliberately loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiBody = { success: boolean; data: any; error: { code: string; message: string } };

/** Minimal cookie jar for `api.request`. */
export class Session {
  private cookie = '';

  constructor(private readonly app: { request: (input: string, init?: RequestInit) => Response | Promise<Response> }) {}

  /** The raw Response (not parsed as JSON), with this session's cookie: for the SSE stream. */
  async raw(path: string): Promise<Response> {
    return await this.app.request(path, { method: 'GET', headers: this.cookie ? { Cookie: this.cookie } : {} });
  }

  async call(method: string, path: string, body?: unknown) {
    const res = await this.app.request(path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) {
      const pair = set.split(';')[0]!;
      this.cookie = pair.endsWith('=') ? '' : pair;
    }
    return { status: res.status, body: ((await res.json().catch(() => ({}))) as ApiBody), headers: res.headers };
  }
}
