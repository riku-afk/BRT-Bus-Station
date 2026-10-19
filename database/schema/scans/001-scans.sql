-- Scans (SCN-04). Every attempt a konduktor makes to check a ticket is recorded, whatever the outcome.
-- Insert-only evidence: a scan is never changed or deleted (trigger below). The ticket `used` transition is the only
-- ticket update a scan causes, and it happens in the same transaction as the scan row.
--   result: valid | already_used | expired | invalid
--   reason: a short machine code for WHY a scan was rejected (e.g. not_paid, cancelled, bad_token, unknown_ticket).
-- The scanned token itself is never stored (GEN-06). ticket_id is null when no ticket could be identified.
-- bus_id is the konduktor's assigned bus at that moment, null if they had none (SCN-07).
CREATE TABLE IF NOT EXISTS scans (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid REFERENCES tickets (id) ON DELETE RESTRICT,
  konduktor_id uuid NOT NULL REFERENCES konduktors (id) ON DELETE RESTRICT,
  bus_id       uuid REFERENCES buses (id) ON DELETE RESTRICT,
  result       text NOT NULL CHECK (result IN ('valid', 'already_used', 'expired', 'invalid')),
  reason       text CHECK (reason IS NULL OR length(reason) <= 40),
  scanned_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scans_konduktor_idx ON scans (konduktor_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS scans_bus_idx ON scans (bus_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS scans_ticket_idx ON scans (ticket_id);
CREATE INDEX IF NOT EXISTS scans_time_idx ON scans (scanned_at DESC);

DROP TRIGGER IF EXISTS scans_insert_only ON scans;
CREATE TRIGGER scans_insert_only BEFORE UPDATE OR DELETE ON scans FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
