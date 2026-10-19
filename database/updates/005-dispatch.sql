-- P4b Dispatch (TRK-08) and always-on line buses. Idempotent: a fresh install also runs this after the schema files.

CREATE TABLE IF NOT EXISTS bus_trips (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id                 uuid NOT NULL REFERENCES buses (id) ON DELETE CASCADE,
  origin_station_id      uuid NOT NULL REFERENCES stations (id) ON DELETE CASCADE,
  destination_station_id uuid NOT NULL REFERENCES stations (id) ON DELETE CASCADE,
  status                 text NOT NULL DEFAULT 'en_route' CHECK (status IN ('en_route', 'completed', 'cancelled')),
  dispatched_by          uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  completed_at           timestamptz,
  CHECK (origin_station_id <> destination_station_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS bus_trips_one_active_per_bus ON bus_trips (bus_id) WHERE status = 'en_route';

ALTER TABLE bus_positions ADD COLUMN IF NOT EXISTS service text NOT NULL DEFAULT 'line' CHECK (service IN ('line', 'dispatch'));
ALTER TABLE bus_positions ADD COLUMN IF NOT EXISTS origin_station_id uuid REFERENCES stations (id) ON DELETE SET NULL;
ALTER TABLE bus_positions ADD COLUMN IF NOT EXISTS destination_station_id uuid REFERENCES stations (id) ON DELETE SET NULL;
ALTER TABLE bus_positions ADD COLUMN IF NOT EXISTS trip_id uuid REFERENCES bus_trips (id) ON DELETE SET NULL;

-- The line buses now run whenever the worker runs: there is no start / stop / reset any more.
ALTER TABLE simulator_state DROP COLUMN IF EXISTS status;
ALTER TABLE simulator_state DROP COLUMN IF EXISTS reset_counter;
ALTER TABLE simulator_state DROP COLUMN IF EXISTS started_at;
