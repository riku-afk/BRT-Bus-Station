/**
 * Environment Configuration
 *
 * Validated once at startup. Add every new variable here and to .env.example.
 * Next.js (app) and Bun (scripts/workers) both load .env automatically.
 */
import { z } from 'zod';
import { APP_ENVIRONMENTS } from '@shared/app-info';
import { parseHostRoles } from '@shared/host-roles';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_ENV: z.enum(APP_ENVIRONMENTS).default('local'),
  APP_BASE_URL: z.url().default('http://localhost:3000'),
  LOG_FORMAT: z.enum(['pretty', 'json']).default('pretty'),
  // Other addresses the app is opened from, besides APP_BASE_URL: writes from these origins are accepted (comma separated, e.g. the
  // Android emulator's http://localhost:8080 when the port is forwarded with adb reverse). Every other site stays refused.
  APP_EXTRA_ORIGINS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((o) => o.trim()).filter(Boolean)),

  // Which role may sign in on which address, e.g. "brt.example.com=admin,scan.example.com=konduktor,app.example.com=passenger". Empty = no restriction.
  HOST_ROLES: z.string().default(''),

  DATABASE_URL: z.string().min(1).default('postgres://postgres:password@localhost:5432/brt_bus_station'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  // Session JWT (HS256) and QR ticket signing. Use different values; each must be at least 32 characters.
  SESSION_SECRET: z.string().min(32).default('dev-only-session-secret-change-me-0123456789'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  QR_SIGNING_SECRET: z.string().min(32).default('dev-only-qr-signing-secret-change-me-0123456789'),

  // Single sign-on from the partner system (the Smart City app). Off unless SSO_ENABLED=true. The partner signs short-lived HS256 tokens
  // with this shared secret (at least 32 characters; never in the mobile app). See plan/sso.md.
  SSO_ENABLED: z.enum(['true', 'false']).default('false'),
  SSO_SHARED_SECRET: z.string().min(32).optional(),
  SSO_ISSUER: z.string().min(1).default('sce'),
  // The hand-off token (browser) and the server-to-server token (ticket list) have different audiences, so one cannot be used as the other.
  SSO_AUDIENCE: z.string().min(1).default('brt'),
  SSO_API_AUDIENCE: z.string().min(1).default('brt-api'),
  // A token older than this is refused even if its own expiry is later.
  SSO_MAX_TOKEN_AGE_SECONDS: z.coerce.number().int().min(10).max(600).default(120),
  TICKET_PENDING_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  // How often the expiry worker looks for unpaid / lapsed tickets.
  TICKET_EXPIRY_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(30),

  // Payment gateway adapter: `mock` works offline; `pisopay` uses PisoPay (sandbox or live depending on its credentials).
  PAYMENT_PROVIDER: z.enum(['mock', 'pisopay']).default('mock'),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16).default('dev-only-webhook-secret'),
  // PisoPay (only used when PAYMENT_PROVIDER=pisopay). The API credentials also sign its webhooks.
  PISOPAY_BASE_URL: z.url().default('https://api-checkout.pisopay.com.ph'),
  PISOPAY_API_USERNAME: z.string().optional(),
  PISOPAY_API_PASSWORD: z.string().optional(),
  // The processor name PisoPay registered for this merchant.
  PISOPAY_PROCESSOR_NAME: z.string().default('BRTBusStation'),
  // QR Ph channels to try, in order: QR1 first, QR2 / QR3 as fallbacks when a channel is unavailable.
  PISOPAY_QR_CHANNELS: z
    .string()
    .default('QR1,QR2,QR3')
    .transform((v) => v.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean)),

  // Email (NTF-01): `console` only records that a message would be sent (default, works offline); `smtp` really sends it.
  MAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  MAIL_FROM: z.string().min(3).default('Cavite Smart Transport Terminal <no-reply@brt.local>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  // true = TLS from the first byte (port 465); false = STARTTLS when the server offers it (port 587).
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  // Where bus routes come from. `osrm` draws the real road between shelters (OSRM; the public demo server is for development only);
  // `none` keeps straight lines (tests, offline).
  ROUTING_PROVIDER: z.enum(['osrm', 'none']).default('osrm'),
  OSRM_BASE_URL: z.url().default('https://router.project-osrm.org'),
  // Bus simulator (scripts/bus-simulator-worker.ts)
  SIM_BUS_COUNT: z.coerce.number().int().min(1).max(10).default(4),
  SIM_SPEED_KMH: z.coerce.number().positive().default(120),
  SIM_DWELL_SECONDS: z.coerce.number().min(0).default(4),
  SIM_TICK_MS: z.coerce.number().int().min(100).default(1000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${lines}`);
}
const e = parsed.data;

if (e.MAIL_PROVIDER === 'smtp' && !e.SMTP_HOST) {
  throw new Error('MAIL_PROVIDER=smtp needs SMTP_HOST (and usually SMTP_USER / SMTP_PASSWORD).');
}

if (e.SSO_ENABLED === 'true' && !e.SSO_SHARED_SECRET) {
  throw new Error('SSO_ENABLED=true needs SSO_SHARED_SECRET (at least 32 characters).');
}

if (e.PAYMENT_PROVIDER === 'pisopay' && (!e.PISOPAY_API_USERNAME || !e.PISOPAY_API_PASSWORD)) {
  throw new Error('PAYMENT_PROVIDER=pisopay needs PISOPAY_API_USERNAME and PISOPAY_API_PASSWORD.');
}

if (e.APP_ENV === 'prod') {
  const defaults = [e.SESSION_SECRET, e.QR_SIGNING_SECRET].some((s) => s.startsWith('dev-only'));
  if (defaults) throw new Error('Refusing to start in prod with development secrets.');
  if (e.SSO_ENABLED === 'true' && e.SSO_SHARED_SECRET?.startsWith('dev-only')) throw new Error('Refusing to start in prod with a development SSO secret.');
  // The mock gateway lets anyone with a checkout link "pay": it must never run in production.
  if (e.PAYMENT_PROVIDER === 'mock') throw new Error('Refusing to start in prod with PAYMENT_PROVIDER=mock.');
}

export const env = {
  nodeEnv: e.NODE_ENV,
  isDev: e.NODE_ENV !== 'production',
  isTest: e.NODE_ENV === 'test',
  appEnv: e.APP_ENV,
  baseUrl: e.APP_BASE_URL,
  extraOrigins: e.APP_EXTRA_ORIGINS,
  hostRoles: parseHostRoles(e.HOST_ROLES),
  logFormat: e.LOG_FORMAT,
  database: { url: e.DATABASE_URL, poolMax: e.DATABASE_POOL_MAX },
  session: { secret: e.SESSION_SECRET, ttlHours: e.SESSION_TTL_HOURS },
  qr: { signingSecret: e.QR_SIGNING_SECRET },
  sso: {
    enabled: e.SSO_ENABLED === 'true',
    secret: e.SSO_SHARED_SECRET ?? '',
    issuer: e.SSO_ISSUER,
    audience: e.SSO_AUDIENCE,
    apiAudience: e.SSO_API_AUDIENCE,
    maxTokenAgeSeconds: e.SSO_MAX_TOKEN_AGE_SECONDS,
  },
  tickets: { pendingTtlMinutes: e.TICKET_PENDING_TTL_MINUTES, expiryIntervalSeconds: e.TICKET_EXPIRY_INTERVAL_SECONDS },
  payment: {
    provider: e.PAYMENT_PROVIDER,
    webhookSecret: e.PAYMENT_WEBHOOK_SECRET,
    pisopay: { baseUrl: e.PISOPAY_BASE_URL, username: e.PISOPAY_API_USERNAME, password: e.PISOPAY_API_PASSWORD, processorName: e.PISOPAY_PROCESSOR_NAME, qrChannels: e.PISOPAY_QR_CHANNELS },
  },
  mail: {
    provider: e.MAIL_PROVIDER,
    from: e.MAIL_FROM,
    smtp: { host: e.SMTP_HOST, port: e.SMTP_PORT, secure: e.SMTP_SECURE === 'true', user: e.SMTP_USER, password: e.SMTP_PASSWORD },
  },
  routing: { provider: e.ROUTING_PROVIDER, osrmBaseUrl: e.OSRM_BASE_URL },
  simulator: { busCount: e.SIM_BUS_COUNT, speedKmh: e.SIM_SPEED_KMH, dwellSeconds: e.SIM_DWELL_SECONDS, tickMs: e.SIM_TICK_MS },
} as const;
