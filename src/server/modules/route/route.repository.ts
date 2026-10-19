/** SQL only. Road geometry between neighbouring shelters. */
import type { SQLExecutor } from '@core/database';

export type SegmentRow = {
  from_station_id: string;
  to_station_id: string;
  from_lat: number;
  from_lng: number;
  to_lat: number;
  to_lng: number;
  geometry: [number, number][];
  distance_meters: number;
  source: string;
};

export const routeRepository = {
  list(db: SQLExecutor): Promise<SegmentRow[]> {
    return db.query<SegmentRow>('SELECT from_station_id, to_station_id, from_lat, from_lng, to_lat, to_lng, geometry, distance_meters, source FROM route_segments');
  },

  async upsert(db: SQLExecutor, row: SegmentRow): Promise<void> {
    await db.query(
      `INSERT INTO route_segments (from_station_id, to_station_id, from_lat, from_lng, to_lat, to_lng, geometry, distance_meters, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
       ON CONFLICT (from_station_id, to_station_id) DO UPDATE
         SET from_lat = $3, from_lng = $4, to_lat = $5, to_lng = $6, geometry = $7::jsonb, distance_meters = $8, source = $9, created_at = now()`,
      [row.from_station_id, row.to_station_id, row.from_lat, row.from_lng, row.to_lat, row.to_lng, JSON.stringify(row.geometry), row.distance_meters, row.source],
    );
  },

  async deleteAll(db: SQLExecutor): Promise<void> {
    await db.query('DELETE FROM route_segments');
  },
};
