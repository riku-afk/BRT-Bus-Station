-- P5 Payments (PAY-02..07). Idempotent: a fresh install also runs this after the schema files.
--   * Money is integer centavos. The amount, ticket, provider and reference never change once written.
--   * Only `status` (and the review note / method) move, and only through conditional UPDATEs in the service layer.
--   * Payments are evidence: they are never deleted.
-- Statuses: pending -> succeeded | failed | cancelled | needs_review.
--   needs_review = money arrived that could not be applied to the ticket (wrong amount, ticket already cancelled,
--   expired or paid): an admin looks at it. There is no refund flow in the POC.
CREATE TABLE IF NOT EXISTS payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       uuid NOT NULL REFERENCES tickets (id) ON DELETE RESTRICT,
  provider        text NOT NULL CHECK (provider IN ('mock', 'paymongo')),
  provider_ref    text NOT NULL,
  method          text,
  amount_centavos integer NOT NULL CHECK (amount_centavos >= 0),
  checkout_url    text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled', 'needs_review')),
  review_reason   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_ref)
);

-- At most one open checkout per ticket: a second "pay" click reuses it.
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_pending_per_ticket ON payments (ticket_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS payments_ticket_idx ON payments (ticket_id);
CREATE INDEX IF NOT EXISTS payments_created_idx ON payments (created_at DESC);

CREATE OR REPLACE FUNCTION payments_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payments are evidence and cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.id <> OLD.id OR NEW.ticket_id <> OLD.ticket_id OR NEW.provider <> OLD.provider
     OR NEW.provider_ref <> OLD.provider_ref OR NEW.amount_centavos <> OLD.amount_centavos
     OR NEW.checkout_url <> OLD.checkout_url OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'a payment''s amount, ticket and provider reference cannot be changed' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payments_guard_trg ON payments;
CREATE TRIGGER payments_guard_trg BEFORE UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION payments_guard();

-- Every webhook event the app has accepted, once. UNIQUE (provider, event_id) is what makes redelivery harmless
-- (PAY-04). Insert-only evidence: `outcome` records what the app did with the event. The payload itself is never stored.
CREATE TABLE IF NOT EXISTS payment_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     text NOT NULL,
  event_id     text NOT NULL,
  payment_id   uuid REFERENCES payments (id) ON DELETE RESTRICT,
  event_type   text NOT NULL,
  payload_hash text NOT NULL,
  outcome      text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

DROP TRIGGER IF EXISTS payment_events_insert_only ON payment_events;
CREATE TRIGGER payment_events_insert_only BEFORE UPDATE OR DELETE ON payment_events FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
