-- Planned destination (passenger map). Idempotent: a fresh install also runs this after the schema files.
-- While a konduktor's bus waits at a shelter they can say where its next trip is headed, so passengers at that shelter see
-- "Headed to X" instead of a guess. It is only set while the bus is available, and is cleared when the bus leaves or is
-- parked again. Dispatching without choosing a station sends the bus to the planned one.
ALTER TABLE bus_availability ADD COLUMN IF NOT EXISTS planned_destination_id uuid REFERENCES stations (id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bus_availability_plan_only_when_available') THEN
    ALTER TABLE bus_availability
      ADD CONSTRAINT bus_availability_plan_only_when_available CHECK (status = 'available' OR planned_destination_id IS NULL);
  END IF;
END $$;
