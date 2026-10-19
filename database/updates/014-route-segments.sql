-- Road geometry between shelters (the bus route on the map). Idempotent: a fresh install also runs this after the schema files.
-- One row per pair of neighbouring shelters: the road a bus drives from `from` to `to`, as [[lat, lng], ...] from a routing
-- service (OSRM). The coordinates the road was fetched for are stored with it, so a row for a shelter that has since been moved is
-- recognised as stale and ignored (the map falls back to a straight line there until the road is fetched again).
CREATE TABLE IF NOT EXISTS route_segments (
  from_station_id uuid NOT NULL REFERENCES stations (id) ON DELETE CASCADE,
  to_station_id   uuid NOT NULL REFERENCES stations (id) ON DELETE CASCADE,
  from_lat        double precision NOT NULL,
  from_lng        double precision NOT NULL,
  to_lat          double precision NOT NULL,
  to_lng          double precision NOT NULL,
  geometry        jsonb NOT NULL,
  distance_meters double precision NOT NULL CHECK (distance_meters > 0),
  source          text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (from_station_id, to_station_id)
);
