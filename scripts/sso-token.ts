/**
 * Development helper: play the part of the partner backend and print a hand-off link, so the whole SSO flow can be tried
 * without the Smart City app.
 *
 *   bun run scripts/sso-token.ts [citizenId] [--name "Juan Dela Cruz"] [--email juan@example.com] [--next /tickets] [--api]
 *
 * Needs SSO_ENABLED=true and SSO_SHARED_SECRET in .env (the same secret the partner backend signs with).
 * With --api it prints the server-to-server token for GET /api/partner/tickets instead.
 */
import { SignJWT } from 'jose';
import { env } from '../src/server/config/env';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const citizenId = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? '1001';

if (!env.sso.enabled) {
  console.error('SSO is off. Set SSO_ENABLED=true and SSO_SHARED_SECRET in .env first.');
  process.exit(1);
}
if (env.appEnv === 'prod') {
  console.error('This helper is for development only.');
  process.exit(1);
}

const api = args.includes('--api');
const token = await new SignJWT({ name: flag('name') ?? 'Demo Citizen', email: flag('email') ?? `citizen${citizenId}@sce.test` })
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject(citizenId)
  .setIssuer(env.sso.issuer)
  .setAudience(api ? env.sso.apiAudience : env.sso.audience)
  .setIssuedAt()
  .setJti(crypto.randomUUID())
  .setExpirationTime('60s')
  .sign(new TextEncoder().encode(env.sso.secret));

if (api) {
  console.log(`curl -H "Authorization: Bearer ${token}" ${env.baseUrl}/api/partner/tickets`);
} else {
  const next = flag('next');
  console.log(`${env.baseUrl}/api/sso/login?token=${token}${next ? `&next=${encodeURIComponent(next)}` : ''}`);
  console.log('(valid for 60 seconds, opens once)');
}
