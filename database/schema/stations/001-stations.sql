-- Stations along the single line, ordered by `sequence` (1..N, contiguous). STN-01.
-- The unique constraint is DEFERRABLE so a reorder can renumber rows inside one transaction.
CREATE TABLE IF NOT EXISTS stations (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name      text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  sequence  integer NOT NULL CHECK (sequence >= 1),
  latitude  double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT stations_sequence_unique UNIQUE (sequence) DEFERRABLE INITIALLY DEFERRED
);
