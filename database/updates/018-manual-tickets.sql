-- Manual tickets: an admin sells a ticket over the counter (cash) and the passenger gets a printed or sent QR code.
-- Idempotent: a fresh install also runs this after the schema files.
-- `source` says where a ticket came from. A manual ticket is created already paid: the admin who sold it is `encoded_by` (and, since a
-- ticket needs an owner, `passenger_id`), and `passenger_name` is whoever bought it, when the admin typed one in. No payment row is
-- written: there is no payment provider involved, and sales reports read the ticket itself (paid_at, fare_centavos).
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'online' CHECK (source IN ('online', 'manual'));
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS passenger_name text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS encoded_by uuid REFERENCES users (id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS tickets_manual_idx ON tickets (created_at DESC) WHERE source = 'manual';
