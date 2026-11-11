-- Users of all three roles (passenger, konduktor, admin). One role per user.
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name     text NOT NULL,
  role          text NOT NULL CHECK (role IN ('passenger', 'konduktor', 'admin')),
  is_active     boolean NOT NULL DEFAULT true,
  -- Senior Citizen / PWD discount the partner app vouches for (update 019), refreshed at every sign-in through it.
  discount_type text CHECK (discount_type IN ('senior', 'pwd', 'student')),
  discount_id   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
