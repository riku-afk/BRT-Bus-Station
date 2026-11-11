-- Senior Citizen / PWD discount (20% off the ID holder's own fare). Idempotent: a fresh install also runs this after the schema files.
-- A passenger who signs in through the partner app (SSO) carries the kind of discount and the ID number the partner vouches for; it is
-- refreshed at every sign-in, so it follows what the partner says today. The ticket freezes what was applied at purchase: the kind, the ID
-- number the konduktor checks against the printed ID, and how many centavos were taken off (fare_centavos stays the total that is paid).
ALTER TABLE users ADD COLUMN IF NOT EXISTS discount_type text CHECK (discount_type IN ('senior', 'pwd'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS discount_id text;

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS discount_type text CHECK (discount_type IN ('senior', 'pwd'));
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS discount_id text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS discount_centavos integer NOT NULL DEFAULT 0 CHECK (discount_centavos >= 0);
