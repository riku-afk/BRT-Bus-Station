-- P4 Tracking (TRK-03, TRK-06). Idempotent: a fresh install also runs this after the schema files.
CREATE TABLE IF NOT EXISTS bus_positions (
  bus_id           uuid PRIMARY KEY REFERENCES buses (id) ON DELETE CASCADE,
  latitude         double precision NOT NULL,
  longitude        double precision NOT NULL,
  heading_degrees  real NOT NULL,
  speed_kmh        real NOT NULL,
  distance_meters  double precision NOT NULL,
  direction        smallint NOT NULL CHECK (direction IN (1, -1)),
  next_station_id  uuid REFERENCES stations (id) ON DELETE SET NULL,
  at_station       boolean NOT NULL DEFAULT false,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulator_state (
  id                  smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  status              text NOT NULL DEFAULT 'stopped' CHECK (status IN ('running', 'stopped')),
  reset_counter       integer NOT NULL DEFAULT 0,
  started_at          timestamptz,
  worker_heartbeat_at timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
