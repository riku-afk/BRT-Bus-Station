/** Create-or-keep a user from a Bun script (bcrypt hash identical to the API's). */
import bcrypt from 'bcryptjs';
import type { Client } from 'pg';

export async function ensureUser(
  client: Client,
  user: { email: string; fullName: string; role: 'passenger' | 'konduktor' | 'admin'; password: string },
): Promise<'created' | 'exists'> {
  const existing = await client.query('SELECT 1 FROM users WHERE email = $1', [user.email]);
  if (existing.rowCount) return 'exists';
  const hash = await bcrypt.hash(user.password, 10);
  await client.query('INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4)', [
    user.email,
    hash,
    user.fullName,
    user.role,
  ]);
  return 'created';
}
