-- P5b Konduktor-controlled buses (TRK-08, KON-04/05, STN-07). Idempotent: a fresh install also runs this after the schema files.
--
-- A bus with a konduktor assigned is CREWED: it waits parked at a station until its konduktor dispatches it. Buses with no
-- konduktor keep running the line automatically. `bus_availability` is a crewed bus's own state; the simulator worker
-- reads it, parks the bus, and puts it back here as `available` when a dispatched trip ends.
CREATE TABLE IF NOT EXISTS bus_availability (
  bus_id                uuid PRIMARY KEY REFERENCES buses (id) ON DELETE CASCADE,
  -- Where the bus is parked while available; the origin of its trip while on the road (so a worker restart can re-park it).
  station_id            uuid REFERENCES stations (id) ON DELETE SET NULL,
  status                text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'on_road')),
  -- Set by the konduktor while available, so passengers can see roughly when the bus leaves.
  expected_departure_at timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'available' OR expected_departure_at IS NULL)
);

-- Parked buses are on the map too.
ALTER TABLE bus_positions DROP CONSTRAINT IF EXISTS bus_positions_service_check;
ALTER TABLE bus_positions ADD CONSTRAINT bus_positions_service_check CHECK (service IN ('line', 'dispatch', 'parked'));
