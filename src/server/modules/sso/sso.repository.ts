/** SQL only. */
import type { SQLExecutor } from '@core/database';
import type { UserRow } from '@modules/auth/auth.types';

export const ssoRepository = {
  async findByExternal(db: SQLExecutor, provider: string, externalId: string): Promise<UserRow | null> {
    const rows = await db.query<UserRow>('SELECT * FROM users WHERE external_provider = $1 AND external_id = $2', [provider, externalId]);
    return rows[0] ?? null;
  },

  async emailTaken(db: SQLExecutor, email: string): Promise<boolean> {
    const rows = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
    return rows.length > 0;
  },

  /** A passenger who signs in only through the partner: the password is a random value nobody knows. */
  async insertExternal(db: SQLExecutor, input: { provider: string; externalId: string; email: string; passwordHash: string; fullName: string }): Promise<UserRow> {
    const rows = await db.query<UserRow>(
      `INSERT INTO users (email, password_hash, full_name, role, external_provider, external_id)
       VALUES ($1, $2, $3, 'passenger', $4, $5) RETURNING *`,
      [input.email, input.passwordHash, input.fullName, input.provider, input.externalId],
    );
    return rows[0]!;
  },

  async updateName(db: SQLExecutor, id: string, fullName: string): Promise<void> {
    await db.query('UPDATE users SET full_name = $2 WHERE id = $1 AND full_name <> $2', [id, fullName]);
  },

  /** True the first time a token id is seen; false when it was already used. */
  async recordTokenUse(db: SQLExecutor, jti: string): Promise<boolean> {
    const rows = await db.query('INSERT INTO sso_token_uses (jti) VALUES ($1) ON CONFLICT DO NOTHING RETURNING jti', [jti]);
    // Old entries cannot matter any more (a token is refused once older than the maximum age): keep the table small.
    await db.query("DELETE FROM sso_token_uses WHERE used_at < now() - interval '1 day'");
    return rows.length === 1;
  },
};
