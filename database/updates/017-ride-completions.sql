-- Rides (a bus's passenger count). Idempotent: a fresh install also runs this after the schema files.
-- The passengers on board are the passengers of the valid scans on a bus since its last completed ride. Completing a ride (the
-- konduktor, once the bus has arrived) records a row here; nothing is ever changed or deleted, a count "starts again from zero"
-- only because scans before the latest completion are no longer counted. Insert-only evidence, like scans.
CREATE TABLE IF NOT EXISTS ride_completions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id       uuid NOT NULL REFERENCES buses (id) ON DELETE RESTRICT,
  konduktor_id uuid NOT NULL REFERENCES konduktors (id) ON DELETE RESTRICT,
  passengers   integer NOT NULL CHECK (passengers >= 0),
  tickets      integer NOT NULL CHECK (tickets >= 0),
  completed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ride_completions_bus_idx ON ride_completions (bus_id, completed_at DESC);

DROP TRIGGER IF EXISTS ride_completions_insert_only ON ride_completions;
CREATE TRIGGER ride_completions_insert_only BEFORE UPDATE OR DELETE ON ride_completions FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
