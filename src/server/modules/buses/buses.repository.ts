/** SQL only. */
import type { SQLExecutor } from '@core/database';
import type { BusRow, BusStatus } from './buses.types';

const SELECT = `
  SELECT b.id, b.plate_number, b.name, b.status, b.konduktor_id, u.full_name AS konduktor_name
    FROM buses b
    LEFT JOIN konduktors k ON k.id = b.konduktor_id
    LEFT JOIN users u ON u.id = k.user_id`;

export const busesRepository = {
  list(db: SQLExecutor, opts: { limit: number; offset: number }): Promise<BusRow[]> {
    return db.query<BusRow>(`${SELECT} ORDER BY b.name, b.plate_number LIMIT $1 OFFSET $2`, [opts.limit, opts.offset]);
  },

  async count(db: SQLExecutor): Promise<number> {
    return (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM buses'))[0]!.n;
  },

  /** Every bus, name and plate only: for a drop-down. Bounded, and small per row. */
  options(db: SQLExecutor): Promise<{ id: string; name: string; plate_number: string }[]> {
    return db.query('SELECT id, name, plate_number FROM buses ORDER BY name, plate_number LIMIT 1000');
  },

  async findById(db: SQLExecutor, id: string): Promise<BusRow | null> {
    const rows = await db.query<BusRow>(`${SELECT} WHERE b.id = $1`, [id]);
    return rows[0] ?? null;
  },

  async findByKonduktor(db: SQLExecutor, konduktorId: string): Promise<BusRow | null> {
    const rows = await db.query<BusRow>(`${SELECT} WHERE b.konduktor_id = $1`, [konduktorId]);
    return rows[0] ?? null;
  },

  async insert(db: SQLExecutor, input: { plateNumber: string; name: string; status: BusStatus }): Promise<string> {
    const rows = await db.query<{ id: string }>('INSERT INTO buses (plate_number, name, status) VALUES ($1, $2, $3) RETURNING id', [
      input.plateNumber,
      input.name,
      input.status,
    ]);
    return rows[0]!.id;
  },

  async update(db: SQLExecutor, id: string, patch: { plateNumber?: string; name?: string; status?: BusStatus }): Promise<boolean> {
    const rows = await db.query(
      `UPDATE buses SET
         plate_number = COALESCE($2, plate_number),
         name = COALESCE($3, name),
         status = COALESCE($4, status)
       WHERE id = $1 RETURNING id`,
      [id, patch.plateNumber ?? null, patch.name ?? null, patch.status ?? null],
    );
    return rows.length > 0;
  },

  async setKonduktor(db: SQLExecutor, busId: string, konduktorId: string | null): Promise<void> {
    await db.query('UPDATE buses SET konduktor_id = $2 WHERE id = $1', [busId, konduktorId]);
  },

  async unassignKonduktor(db: SQLExecutor, konduktorId: string): Promise<void> {
    await db.query('UPDATE buses SET konduktor_id = NULL WHERE konduktor_id = $1', [konduktorId]);
  },

  async delete(db: SQLExecutor, id: string): Promise<boolean> {
    const rows = await db.query('DELETE FROM buses WHERE id = $1 RETURNING id', [id]);
    return rows.length > 0;
  },
};
