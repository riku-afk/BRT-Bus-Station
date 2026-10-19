-- P8 QR Ph. Idempotent: a fresh install also runs this after the schema files.
-- A QR Ph checkout keeps what PisoPay returned for the payment so the passenger can see (and re-open) the QR:
--   qr_payload           the EMV QR Ph string PisoPay generated for this payment (it already carries the amount)
--   provider_reference_no  PisoPay's reference number, used to ask PisoPay whether it was paid
--   channel_code         which PisoPay QR channel produced it (QR1 / QR2 / QR3)
-- All three are written once, when the checkout is created, and never change (the guard below enforces it).
ALTER TABLE payments ADD COLUMN IF NOT EXISTS qr_payload text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_reference_no text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS channel_code text;

CREATE OR REPLACE FUNCTION payments_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payments are evidence and cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.id <> OLD.id OR NEW.ticket_id <> OLD.ticket_id OR NEW.provider <> OLD.provider
     OR NEW.provider_ref <> OLD.provider_ref OR NEW.amount_centavos <> OLD.amount_centavos
     OR NEW.checkout_url <> OLD.checkout_url OR NEW.created_at <> OLD.created_at
     OR NEW.qr_payload IS DISTINCT FROM OLD.qr_payload
     OR NEW.provider_reference_no IS DISTINCT FROM OLD.provider_reference_no
     OR NEW.channel_code IS DISTINCT FROM OLD.channel_code THEN
    RAISE EXCEPTION 'a payment''s amount, ticket and provider reference cannot be changed' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
