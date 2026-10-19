/** SQL only. */
import type { SQLExecutor } from '@core/database';
import type { BusPositionUpdate } from '@shared/tracking/models';
import type { ActiveBus, MyBusRow, ParkingRow, PositionRow, TripRow } from './tracking.types';

/** NOTIFY channel the SSE hub listens on. The payload is empty: listeners re-read the table. */
export const POSITIONS_CHANNEL = 'bus_positions';

/** A bus is CREWED when it has an active konduktor: that konduktor controls it. Every other bus runs the line by itself. */
const HAS_ACTIVE_KONDUKTOR = `EXISTS (SELECT 1 FROM konduktors kk JOIN users uu ON uu.id = kk.user_id WHERE kk.id = b.konduktor_id AND uu.is_active)`;

export const trackingRepository = {
  /** Positions of buses that are in service. A bus set to inactive or maintenance disappears from the map at once. */
  listPositions(db: SQLExecutor): Promise<PositionRow[]> {
    return db.query<PositionRow>(
      `SELECT p.bus_id, b.name AS bus_name, b.plate_number, p.latitude, p.longitude, p.heading_degrees, p.speed_kmh,
              p.distance_meters, p.direction, p.next_station_id, ns.name AS next_station_name, p.at_station,
              p.service, p.origin_station_id, os.name AS origin_station_name,
              p.destination_station_id, ds.name AS destination_station_name,
              ku.full_name AS konduktor_name, p.trip_id, t.created_at AS dispatched_at,
              av.expected_departure_at,
              CASE WHEN av.status = 'available' THEN av.planned_destination_id END AS planned_destination_id,
              CASE WHEN av.status = 'available' THEN pd.name END AS planned_destination_name,
              p.updated_at
         FROM bus_positions p
         JOIN buses b ON b.id = p.bus_id AND b.status = 'active'
         LEFT JOIN stations ns ON ns.id = p.next_station_id
         LEFT JOIN stations os ON os.id = p.origin_station_id
         LEFT JOIN stations ds ON ds.id = p.destination_station_id
         LEFT JOIN bus_trips t ON t.id = p.trip_id
         LEFT JOIN bus_availability av ON av.bus_id = p.bus_id
         LEFT JOIN stations pd ON pd.id = av.planned_destination_id
         LEFT JOIN konduktors k ON k.id = b.konduktor_id
         LEFT JOIN users ku ON ku.id = k.user_id AND ku.is_active
        ORDER BY b.name, b.plate_number`,
    );
  },

  async upsertPositions(db: SQLExecutor, updates: readonly BusPositionUpdate[]): Promise<void> {
    if (updates.length === 0) return;
    await db.query(
      `INSERT INTO bus_positions (bus_id, latitude, longitude, heading_degrees, speed_kmh, distance_meters, direction,
                                  next_station_id, at_station, service, origin_station_id, destination_station_id, trip_id, updated_at)
       SELECT * FROM unnest($1::uuid[], $2::float8[], $3::float8[], $4::float4[], $5::float4[], $6::float8[], $7::int2[],
                            $8::uuid[], $9::bool[], $10::text[], $11::uuid[], $12::uuid[], $13::uuid[]), now()
       ON CONFLICT (bus_id) DO UPDATE SET
         latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, heading_degrees = EXCLUDED.heading_degrees,
         speed_kmh = EXCLUDED.speed_kmh, distance_meters = EXCLUDED.distance_meters, direction = EXCLUDED.direction,
         next_station_id = EXCLUDED.next_station_id, at_station = EXCLUDED.at_station, service = EXCLUDED.service,
         origin_station_id = EXCLUDED.origin_station_id, destination_station_id = EXCLUDED.destination_station_id,
         trip_id = EXCLUDED.trip_id, updated_at = EXCLUDED.updated_at`,
      [
        updates.map((u) => u.busId),
        updates.map((u) => u.latitude),
        updates.map((u) => u.longitude),
        updates.map((u) => u.headingDegrees),
        updates.map((u) => u.speedKmh),
        updates.map((u) => u.distanceMeters),
        updates.map((u) => u.direction),
        updates.map((u) => u.nextStationId),
        updates.map((u) => u.atStation),
        updates.map((u) => u.service),
        updates.map((u) => u.originStationId),
        updates.map((u) => u.destinationStationId),
        updates.map((u) => u.tripId),
      ],
    );
  },

  /** Remove every position whose bus is not listed (an empty list clears the table). */
  async deleteExcept(db: SQLExecutor, busIds: readonly string[]): Promise<void> {
    await db.query('DELETE FROM bus_positions WHERE NOT (bus_id = ANY($1::uuid[]))', [busIds]);
  },

  async notify(db: SQLExecutor): Promise<void> {
    await db.query('SELECT pg_notify($1, $2)', [POSITIONS_CHANNEL, '']);
  },

  async workerOnline(db: SQLExecutor): Promise<boolean> {
    const rows = await db.query<{ online: boolean }>(
      "SELECT COALESCE(worker_heartbeat_at > now() - interval '10 seconds', false) AS online FROM simulator_state WHERE id = 1",
    );
    return rows[0]?.online ?? false;
  },

  async heartbeat(db: SQLExecutor): Promise<void> {
    await db.query(
      `INSERT INTO simulator_state (id, worker_heartbeat_at) VALUES (1, now())
       ON CONFLICT (id) DO UPDATE SET worker_heartbeat_at = now(), updated_at = now()`,
    );
  },

  // ── Which buses the simulator drives ────────────────────────────────────────────────────────────────────────

  /** Buses with no (active) konduktor: they run the line by themselves. The first `limit`, in a stable order. */
  listAutoBuses(db: SQLExecutor, limit: number): Promise<ActiveBus[]> {
    return db.query<ActiveBus>(
      `SELECT b.id, b.name FROM buses b
        WHERE b.status = 'active' AND NOT ${HAS_ACTIVE_KONDUKTOR}
        ORDER BY b.name, b.plate_number LIMIT $1`,
      [limit],
    );
  },

  /** Buses with an active konduktor: parked until that konduktor dispatches them. */
  listCrewedBuses(db: SQLExecutor): Promise<ActiveBus[]> {
    return db.query<ActiveBus>(
      `SELECT b.id, b.name FROM buses b
        WHERE b.status = 'active' AND ${HAS_ACTIVE_KONDUKTOR}
        ORDER BY b.name, b.plate_number`,
    );
  },

  listParking(db: SQLExecutor): Promise<ParkingRow[]> {
    return db.query<ParkingRow>('SELECT bus_id, station_id, status FROM bus_availability');
  },

  /** Put a bus at a station as available (first placement, a re-park, or arrival). Clears any expected departure. */
  async parkBus(db: SQLExecutor, busId: string, stationId: string): Promise<void> {
    await db.query(
      `INSERT INTO bus_availability (bus_id, station_id, status) VALUES ($1, $2, 'available')
       ON CONFLICT (bus_id) DO UPDATE SET station_id = $2, status = 'available', planned_destination_id = NULL, parked_at = now(), updated_at = now(),
         -- A departure time set while on the road is the departure from the shelter it has now reached: keep it, unless it has passed.
         expected_departure_at = CASE WHEN bus_availability.status = 'on_road' AND bus_availability.expected_departure_at > now() THEN bus_availability.expected_departure_at ELSE NULL END`,
      [busId, stationId],
    );
  },

  // ── Trips ───────────────────────────────────────────────────────────────────────────────────────────────────

  async insertTrip(
    db: SQLExecutor,
    input: { busId: string; originStationId: string; destinationStationId: string; dispatchedBy: string },
  ): Promise<TripRow> {
    const rows = await db.query<TripRow>(
      `INSERT INTO bus_trips (bus_id, origin_station_id, destination_station_id, dispatched_by)
       VALUES ($1, $2, $3, $4) RETURNING id, bus_id, origin_station_id, destination_station_id, status`,
      [input.busId, input.originStationId, input.destinationStationId, input.dispatchedBy],
    );
    return rows[0]!;
  },

  /** Trips the worker should be running: en route, on a bus that is still in service. */
  listActiveTrips(db: SQLExecutor): Promise<TripRow[]> {
    return db.query<TripRow>(
      `SELECT t.id, t.bus_id, t.origin_station_id, t.destination_station_id, t.status
         FROM bus_trips t JOIN buses b ON b.id = t.bus_id AND b.status = 'active'
        WHERE t.status = 'en_route'
        ORDER BY t.created_at`,
    );
  },

  /** Conditional on the trip still being en route, so finishing twice is harmless. */
  async finishTrip(db: SQLExecutor, id: string, status: 'completed' | 'cancelled'): Promise<boolean> {
    const rows = await db.query(
      "UPDATE bus_trips SET status = $2, completed_at = now() WHERE id = $1 AND status = 'en_route' RETURNING id",
      [id, status],
    );
    return rows.length > 0;
  },

  /** Clean worker shutdown: no trips left running, and every bus on the road is parked (available) at its origin. */
  async cancelAllActiveTrips(db: SQLExecutor): Promise<void> {
    await db.query("UPDATE bus_trips SET status = 'cancelled', completed_at = now() WHERE status = 'en_route'");
    await db.query("UPDATE bus_availability SET status = 'available', expected_departure_at = NULL, parked_at = now(), updated_at = now() WHERE status = 'on_road'");
  },

  // ── A konduktor's own bus ───────────────────────────────────────────────────────────────────────────────────

  async findMyBus(db: SQLExecutor, userId: string): Promise<MyBusRow | null> {
    const rows = await db.query<MyBusRow>(
      `SELECT b.id AS bus_id, b.name AS bus_name, b.plate_number, b.status AS bus_status,
              av.status AS av_status, av.station_id, s.name AS station_name, av.expected_departure_at,
              av.planned_destination_id, pd.name AS planned_destination_name,
              t.id AS trip_id, t.origin_station_id AS trip_origin_station_id, so.name AS trip_origin_name,
              t.destination_station_id AS trip_destination_station_id, sd.name AS trip_destination_name, t.created_at AS trip_created_at
         FROM konduktors k
         JOIN buses b ON b.konduktor_id = k.id
         LEFT JOIN bus_availability av ON av.bus_id = b.id
         LEFT JOIN stations s ON s.id = av.station_id
         LEFT JOIN stations pd ON pd.id = av.planned_destination_id
         LEFT JOIN bus_trips t ON t.bus_id = b.id AND t.status = 'en_route'
         LEFT JOIN stations so ON so.id = t.origin_station_id
         LEFT JOIN stations sd ON sd.id = t.destination_station_id
        WHERE k.user_id = $1`,
      [userId],
    );
    return rows[0] ?? null;
  },

  /** Lock the bus's availability row so two taps (or two devices) cannot both dispatch it. */
  async lockAvailability(db: SQLExecutor, busId: string): Promise<ParkingRow | null> {
    const rows = await db.query<ParkingRow>('SELECT bus_id, station_id, status, planned_destination_id, parked_at FROM bus_availability WHERE bus_id = $1 FOR UPDATE', [busId]);
    return rows[0] ?? null;
  },

  /** While available (departure from here) or on the road (departure from where it is going). `inMinutes = null` clears it. */
  async setExpectedDeparture(db: SQLExecutor, busId: string, inMinutes: number | null): Promise<boolean> {
    const rows = await db.query(
      `UPDATE bus_availability
          SET expected_departure_at = CASE WHEN $2::int IS NULL THEN NULL ELSE now() + make_interval(mins => $2::int) END, updated_at = now()
        WHERE bus_id = $1 AND status IN ('available', 'on_road') RETURNING bus_id`,
      [busId, inMinutes],
    );
    return rows.length > 0;
  },

  /** Where the next trip is headed (shown to passengers at the shelter). Only while available; null clears it. */
  async setPlannedDestination(db: SQLExecutor, busId: string, stationId: string | null): Promise<boolean> {
    const rows = await db.query(
      "UPDATE bus_availability SET planned_destination_id = $2, updated_at = now() WHERE bus_id = $1 AND status = 'available' RETURNING bus_id",
      [busId, stationId],
    );
    return rows.length > 0;
  },

  /** available -> on_road, conditional so it can only happen once per trip. */
  async markOnRoad(db: SQLExecutor, busId: string): Promise<boolean> {
    const rows = await db.query(
      "UPDATE bus_availability SET status = 'on_road', expected_departure_at = NULL, planned_destination_id = NULL, updated_at = now() WHERE bus_id = $1 AND status = 'available' RETURNING bus_id",
      [busId],
    );
    return rows.length > 0;
  },
};
