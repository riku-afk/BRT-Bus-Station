-- Konduktor profiles (1:1 with a users row of role 'konduktor') and buses. KON-01, BUS-01..03.
CREATE TABLE IF NOT EXISTS konduktors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE RESTRICT,
  employee_no citext NOT NULL UNIQUE CHECK (length(btrim(employee_no)) BETWEEN 1 AND 30),
  phone       text CHECK (phone IS NULL OR length(phone) <= 30),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- A bus has at most one konduktor and a konduktor at most one bus: UNIQUE on konduktor_id (NULLs are allowed many times).
CREATE TABLE IF NOT EXISTS buses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number citext NOT NULL UNIQUE CHECK (length(btrim(plate_number)) BETWEEN 1 AND 20),
  name         text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  konduktor_id uuid UNIQUE REFERENCES konduktors (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
