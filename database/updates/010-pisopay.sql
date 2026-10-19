-- P8 PisoPay. Idempotent: a fresh install also runs this after the schema files.
-- The payment provider list is now mock + pisopay (PayMongo was dropped before it was ever used, so no row can hold it).
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_provider_check;
ALTER TABLE payments ADD CONSTRAINT payments_provider_check CHECK (provider IN ('mock', 'pisopay'));
