/** SQL only. */
import type { SQLExecutor } from '@core/database';
import type { Role } from '@shared/rbac/roles';
import type { UserRow } from './auth.types';

export const authRepository = {
  async findByEmail(db: SQLExecutor, email: string): Promise<UserRow | null> {
    const rows = await db.query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] ?? null;
  },

  async findById(db: SQLExecutor, id: string): Promise<UserRow | null> {
    const rows = await db.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ?? null;
  },

  async insert(db: SQLExecutor, input: { email: string; passwordHash: string; fullName: string; role: Role }): Promise<UserRow> {
    const rows = await db.query<UserRow>(
      'INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [input.email, input.passwordHash, input.fullName, input.role],
    );
    return rows[0]!;
  },

  async update(db: SQLExecutor, id: string, patch: { fullName?: string; isActive?: boolean; passwordHash?: string }): Promise<UserRow | null> {
    const rows = await db.query<UserRow>(
      `UPDATE users SET
         full_name = COALESCE($2, full_name),
         is_active = COALESCE($3, is_active),
         password_hash = COALESCE($4, password_hash)
       WHERE id = $1 RETURNING *`,
      [id, patch.fullName ?? null, patch.isActive ?? null, patch.passwordHash ?? null],
    );
    return rows[0] ?? null;
  },

  async delete(db: SQLExecutor, id: string): Promise<void> {
    await db.query('DELETE FROM users WHERE id = $1', [id]);
  },
};
