/**
 * Create the first admin (AUTH-05). Works in every environment, including production.
 *
 *   bun run db:bootstrap -- --email admin@example.com --password 'S3cret-pass' --name 'Full Name'
 *   (or ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME in the environment)
 *
 * Does nothing if the email already exists.
 */
import { databaseUrl, withClient } from './lib/db';
import { ensureUser } from './lib/users';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const email = (arg('email') ?? process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
const password = arg('password') ?? process.env.ADMIN_PASSWORD ?? '';
const fullName = arg('name') ?? process.env.ADMIN_NAME ?? 'Administrator';

if (!email.includes('@') || password.length < 8 || password.length > 72) {
  console.error('Usage: bun run db:bootstrap -- --email <email> --password <8-72 chars> [--name <full name>]');
  process.exit(1);
}

await withClient(databaseUrl, async (client) => {
  const result = await ensureUser(client, { email, fullName, role: 'admin', password });
  console.log(result === 'created' ? `admin ${email} created` : `admin ${email} already exists — nothing changed`);
});
