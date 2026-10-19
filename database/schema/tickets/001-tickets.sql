-- Tickets (TKT-01..04). A ticket is a trip between two stations; it is not tied to a bus or a direction (TKT-03).
-- Money is integer centavos. Status moves pending_payment -> paid -> used (or expired / cancelled), and every
-- transition is a conditional UPDATE ... WHERE status = '<expected>' in the service layer.
-- The station demand counts (valid tickets, sold today) read this table.
CREATE TABLE IF NOT EXISTS tickets (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code         text NOT NULL UNIQUE,
  passenger_id           uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  origin_station_id      uuid NOT NULL REFERENCES stations (id) ON DELETE RESTRICT,
  destination_station_id uuid NOT NULL REFERENCES stations (id) ON DELETE RESTRICT,
  fare_centavos          integer NOT NULL CHECK (fare_centavos >= 0),
  status                 text NOT NULL DEFAULT 'pending_payment'
                         CHECK (status IN ('pending_payment', 'paid', 'used', 'expired', 'cancelled')),
  valid_until            timestamptz NOT NULL,
  paid_at                timestamptz,
  used_at                timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  -- The bus the ticket was bought on (update 013). No foreign key: tickets are evidence and outlive a bus.
  bus_id                 uuid,
  bus_name               text,
  -- How many passengers this ticket admits (update 015). fare_centavos is the total for all of them.
  quantity               integer NOT NULL DEFAULT 1,
  CONSTRAINT tickets_quantity_range CHECK (quantity BETWEEN 1 AND 20),
  CHECK (origin_station_id <> destination_station_id)
);

CREATE INDEX IF NOT EXISTS tickets_passenger_idx ON tickets (passenger_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tickets_origin_idx ON tickets (origin_station_id, status);
CREATE INDEX IF NOT EXISTS tickets_status_created_idx ON tickets (status, created_at);
