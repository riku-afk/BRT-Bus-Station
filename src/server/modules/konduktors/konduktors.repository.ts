/** SQL only. */
import type { SQLExecutor } from '@core/database';
import type { KonduktorRow } from './konduktors.types';

const SELECT = `
  SELECT k.id, k.user_id, k.employee_no, k.phone, u.email, u.full_name, u.is_active,
         b.id AS bus_id, b.plate_number AS bus_plate, b.name AS bus_name
    FROM konduktors k
    JOIN users u ON u.id = k.user_id
    LEFT JOIN buses b ON b.konduktor_id = k.id`;

export const konduktorsRepository = {
  list(db: SQLExecutor, opts: { limit: number; offset: number }): Promise<KonduktorRow[]> {
    return db.query<KonduktorRow>(`${SELECT} ORDER BY u.full_name, k.id LIMIT $1 OFFSET $2`, [opts.limit, opts.offset]);
  },

  async count(db: SQLExecutor): Promise<number> {
    return (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM konduktors'))[0]!.n;
  },

  /** Every konduktor, name only: for a drop-down. Bounded, and small per row. */
  options(db: SQLExecutor): Promise<{ id: string; full_name: string; is_active: boolean; bus_id: string | null; bus_name: string | null }[]> {
    return db.query(
      'SELECT k.id, u.full_name, u.is_active, b.id AS bus_id, b.name AS bus_name FROM konduktors k JOIN users u ON u.id = k.user_id LEFT JOIN buses b ON b.konduktor_id = k.id ORDER BY u.full_name LIMIT 1000',
    );
  },

  async findById(db: SQLExecutor, id: string): Promise<KonduktorRow | null> {
    const rows = await db.query<KonduktorRow>(`${SELECT} WHERE k.id = $1`, [id]);
    return rows[0] ?? null;
  },

  async findByUserId(db: SQLExecutor, userId: string): Promise<KonduktorRow | null> {
    const rows = await db.query<KonduktorRow>(`${SELECT} WHERE k.user_id = $1`, [userId]);
    return rows[0] ?? null;
  },

  async insert(db: SQLExecutor, input: { userId: string; employeeNo: string; phone: string | null }): Promise<string> {
    const rows = await db.query<{ id: string }>('INSERT INTO konduktors (user_id, employee_no, phone) VALUES ($1, $2, $3) RETURNING id', [
      input.userId,
      input.employeeNo,
      input.phone,
    ]);
    return rows[0]!.id;
  },

  /** `phone` undefined = leave as is; null = clear. */
  async update(db: SQLExecutor, id: string, patch: { employeeNo?: string; phone?: string | null }): Promise<void> {
    await db.query(
      `UPDATE konduktors SET
         employee_no = COALESCE($2, employee_no),
         phone = CASE WHEN $3::boolean THEN $4 ELSE phone END
       WHERE id = $1`,
      [id, patch.employeeNo ?? null, patch.phone !== undefined, patch.phone ?? null],
    );
  },

  async delete(db: SQLExecutor, id: string): Promise<void> {
    await db.query('DELETE FROM konduktors WHERE id = $1', [id]);
  },
};
