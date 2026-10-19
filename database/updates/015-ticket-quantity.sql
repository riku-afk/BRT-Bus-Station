-- Tickets for a group. Idempotent: a fresh install also runs this after the schema files.
-- One purchase can cover several passengers riding the same bus (a family of five): one account, one payment, one QR code.
-- `fare_centavos` stays the TOTAL that is paid (unit fare x quantity), so payments and the amount check are unchanged.
-- Scanning the QR admits the whole group once.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_quantity_range') THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_quantity_range CHECK (quantity BETWEEN 1 AND 20);
  END IF;
END $$;
