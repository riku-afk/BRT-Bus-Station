/** SQL only. */
import type { SQLExecutor } from '@core/database';
import type { StationRow } from './stations.types';

export const stationsRepository = {
  list(db: SQLExecutor, opts: { includeInactive: boolean }): Promise<StationRow[]> {
    return db.query<StationRow>(
      `SELECT * FROM stations ${opts.includeInactive ? '' : 'WHERE is_active'} ORDER BY sequence`,
    );
  },

  async findById(db: SQLExecutor, id: string): Promise<StationRow | null> {
    const rows = await db.query<StationRow>('SELECT * FROM stations WHERE id = $1', [id]);
    return rows[0] ?? null;
  },

  async count(db: SQLExecutor): Promise<number> {
    const rows = await db.query<{ n: string }>('SELECT count(*) AS n FROM stations');
    return Number(rows[0]!.n);
  },

  /** Make room at `sequence` by moving that station and everything after it down the line. */
  async shiftFrom(db: SQLExecutor, sequence: number): Promise<void> {
    await db.query('UPDATE stations SET sequence = sequence + 1 WHERE sequence >= $1', [sequence]);
  },

  /** Close the gap left by a removed station. */
  async closeGapAfter(db: SQLExecutor, sequence: number): Promise<void> {
    await db.query('UPDATE stations SET sequence = sequence - 1 WHERE sequence > $1', [sequence]);
  },

  async insert(db: SQLExecutor, input: { name: string; sequence: number; latitude: number; longitude: number }): Promise<StationRow> {
    const rows = await db.query<StationRow>(
      'INSERT INTO stations (name, sequence, latitude, longitude) VALUES ($1, $2, $3, $4) RETURNING *',
      [input.name, input.sequence, input.latitude, input.longitude],
    );
    return rows[0]!;
  },

  async update(
    db: SQLExecutor,
    id: string,
    patch: { name?: string; latitude?: number; longitude?: number; isActive?: boolean },
  ): Promise<StationRow | null> {
    const rows = await db.query<StationRow>(
      `UPDATE stations SET
         name = COALESCE($2, name),
         latitude = COALESCE($3, latitude),
         longitude = COALESCE($4, longitude),
         is_active = COALESCE($5, is_active)
       WHERE id = $1 RETURNING *`,
      [id, patch.name ?? null, patch.latitude ?? null, patch.longitude ?? null, patch.isActive ?? null],
    );
    return rows[0] ?? null;
  },

  async delete(db: SQLExecutor, id: string): Promise<boolean> {
    const rows = await db.query('DELETE FROM stations WHERE id = $1 RETURNING id', [id]);
    return rows.length > 0;
  },

  /** `orderedIds[0]` becomes sequence 1, and so on. The caller has verified the list is complete. */
  async applyOrder(db: SQLExecutor, orderedIds: string[]): Promise<void> {
    await db.query(
      `UPDATE stations s SET sequence = v.seq
         FROM unnest($1::uuid[]) WITH ORDINALITY AS v(id, seq)
        WHERE s.id = v.id`,
      [orderedIds],
    );
  },

  /**
   * Demand per origin station, from the tickets table (read-only; the tickets module owns writes).
   * "Sold today" uses the Asia/Manila calendar day.
   */
  demandTotals(db: SQLExecutor): Promise<{ station_id: string; valid_tickets: number; sold_today: number }[]> {
    return db.query(
      `SELECT origin_station_id AS station_id,
              count(*) FILTER (WHERE status = 'paid' AND valid_until > now())::int AS valid_tickets,
              count(*) FILTER (WHERE paid_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila'))::int AS sold_today
         FROM tickets
        GROUP BY origin_station_id`,
    );
  },

  demandByDestination(db: SQLExecutor): Promise<{ origin_station_id: string; destination_station_id: string; n: number }[]> {
    return db.query(
      `SELECT origin_station_id, destination_station_id, count(*)::int AS n
         FROM tickets
        WHERE status = 'paid' AND valid_until > now()
        GROUP BY origin_station_id, destination_station_id`,
    );
  },
};
