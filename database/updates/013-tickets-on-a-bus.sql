-- Tickets bought on a bus. Idempotent: a fresh install also runs this after the schema files.
-- A passenger picks a bus that is waiting at their shelter and buys a ticket on it. The ticket remembers the bus (id and
-- name, as the shelter's other tickets remember their stations), so only that bus's konduktor can scan it, and only while the
-- bus waits at the shelter the ticket was bought at. bus_id has no foreign key on purpose: tickets are evidence and must
-- survive a bus being removed from the fleet.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS bus_id uuid;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS bus_name text;
CREATE INDEX IF NOT EXISTS tickets_bus_idx ON tickets (bus_id, created_at DESC) WHERE bus_id IS NOT NULL;

-- When the bus arrived at (was parked at) its current shelter: tickets sold before that belong to an earlier wait.
ALTER TABLE bus_availability ADD COLUMN IF NOT EXISTS parked_at timestamptz NOT NULL DEFAULT now();

-- A konduktor can now say when the bus will leave the shelter it is driving to, so passengers there see its arrival AND
-- when it departs. That time is set while the bus is on the road, so the old "only while available" check goes.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'bus_availability'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%expected_departure_at IS NULL%'
  LOOP
    EXECUTE format('ALTER TABLE bus_availability DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
