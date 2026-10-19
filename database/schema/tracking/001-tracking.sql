-- Dispatched trips (TRK-08): an admin sends a reserve bus from one station to another. The simulator worker runs the
-- trip, then marks it completed; recalling a bus marks it cancelled. A bus has at most one trip en route.
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

-- Latest position of each bus (TRK-03). One row per bus, overwritten on every update; no history in the POC.
-- Written by a position source (the simulator worker now, konduktor GPS later); read by the API and the SSE feed.
-- `service` says whether the bus runs the regular line (automatic), is on a konduktor-dispatched trip, or is parked at a station; origin / destination are the
-- ends of its current run (the line's two terminals, or the dispatched stations).
CREATE TABLE IF NOT EXISTS bus_positions (
  bus_id                 uuid PRIMARY KEY REFERENCES buses (id) ON DELETE CASCADE,
  latitude               double precision NOT NULL,
  longitude              double precision NOT NULL,
  heading_degrees        real NOT NULL,
  speed_kmh              real NOT NULL,
  distance_meters        double precision NOT NULL,
  direction              smallint NOT NULL CHECK (direction IN (1, -1)),
  next_station_id        uuid REFERENCES stations (id) ON DELETE SET NULL,
  at_station             boolean NOT NULL DEFAULT false,
  service                text NOT NULL DEFAULT 'line' CHECK (service IN ('line', 'dispatch', 'parked')),
  origin_station_id      uuid REFERENCES stations (id) ON DELETE SET NULL,
  destination_station_id uuid REFERENCES stations (id) ON DELETE SET NULL,
  trip_id                uuid REFERENCES bus_trips (id) ON DELETE SET NULL,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- A crewed bus (one with a konduktor assigned) waits parked at a station until its konduktor dispatches it; buses with no
-- konduktor run the line automatically. This is a crewed bus's own state (TRK-08, KON-04/05). The simulator parks the
-- bus, and puts it back here as `available` when a dispatched trip ends.
CREATE TABLE IF NOT EXISTS bus_availability (
  bus_id                uuid PRIMARY KEY REFERENCES buses (id) ON DELETE CASCADE,
  -- Where the bus is parked while available; the origin of its trip while on the road (so a worker restart can re-park it).
  station_id            uuid REFERENCES stations (id) ON DELETE SET NULL,
  status                text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'on_road')),
  -- Set by the konduktor, so passengers can see roughly when the bus leaves: while it waits, or (update 013) while it is on the
  -- road, as the time it will leave the shelter it is driving to.
  expected_departure_at timestamptz,
  -- Where the konduktor says the next trip is headed (update 012); shown to passengers at the shelter. Only while available.
  planned_destination_id uuid REFERENCES stations (id) ON DELETE SET NULL,
  -- When the bus arrived at its current shelter (update 013): tickets sold before that belong to an earlier wait.
  parked_at             timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bus_availability_plan_only_when_available CHECK (status = 'available' OR planned_destination_id IS NULL)
);

-- Single-row record the simulator worker checks in to, so the admin panel can tell whether it is running.
CREATE TABLE IF NOT EXISTS simulator_state (
  id                  smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  worker_heartbeat_at timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
