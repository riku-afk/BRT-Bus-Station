/** SQL only. */
import type { SQLExecutor } from '@core/database';
import type { FareSettingsRow, OverrideRow, StationForFare } from './fares.types';

export const faresRepository = {
  async getSettings(db: SQLExecutor): Promise<FareSettingsRow | null> {
    const rows = await db.query<FareSettingsRow>('SELECT base_fare_centavos, per_station_centavos FROM fare_settings WHERE id = 1');
    return rows[0] ?? null;
  },

  async saveSettings(db: SQLExecutor, input: { baseFareCentavos: number; perStationCentavos: number }): Promise<void> {
    await db.query(
      `INSERT INTO fare_settings (id, base_fare_centavos, per_station_centavos) VALUES (1, $1, $2)
       ON CONFLICT (id) DO UPDATE SET base_fare_centavos = $1, per_station_centavos = $2, updated_at = now()`,
      [input.baseFareCentavos, input.perStationCentavos],
    );
  },

  async findStations(db: SQLExecutor, ids: string[]): Promise<StationForFare[]> {
    return db.query<StationForFare>('SELECT id, sequence, is_active FROM stations WHERE id = ANY($1::uuid[])', [ids]);
  },

  /** Pair is stored with the smaller id first, so direction does not matter. */
  async findOverride(db: SQLExecutor, a: string, b: string): Promise<number | null> {
    const rows = await db.query<{ fare_centavos: number }>(
      `SELECT fare_centavos FROM fare_overrides
        WHERE station_a_id = LEAST($1::uuid, $2::uuid) AND station_b_id = GREATEST($1::uuid, $2::uuid)`,
      [a, b],
    );
    return rows[0]?.fare_centavos ?? null;
  },

  listOverrides(db: SQLExecutor): Promise<OverrideRow[]> {
    return db.query<OverrideRow>(
      `SELECT o.station_a_id, o.station_b_id, sa.name AS station_a_name, sb.name AS station_b_name, o.fare_centavos
         FROM fare_overrides o
         JOIN stations sa ON sa.id = o.station_a_id
         JOIN stations sb ON sb.id = o.station_b_id
        ORDER BY LEAST(sa.sequence, sb.sequence), GREATEST(sa.sequence, sb.sequence)`,
    );
  },

  async upsertOverride(db: SQLExecutor, a: string, b: string, fareCentavos: number): Promise<void> {
    await db.query(
      `INSERT INTO fare_overrides (station_a_id, station_b_id, fare_centavos)
       VALUES (LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid), $3)
       ON CONFLICT (station_a_id, station_b_id) DO UPDATE SET fare_centavos = $3, updated_at = now()`,
      [a, b, fareCentavos],
    );
  },

  async deleteOverride(db: SQLExecutor, a: string, b: string): Promise<boolean> {
    const rows = await db.query(
      `DELETE FROM fare_overrides
        WHERE station_a_id = LEAST($1::uuid, $2::uuid) AND station_b_id = GREATEST($1::uuid, $2::uuid)
        RETURNING station_a_id`,
      [a, b],
    );
    return rows.length > 0;
  },
};
