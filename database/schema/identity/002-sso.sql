-- Single sign-on from the partner system (the Smart City app). Idempotent: a fresh install also runs this after the schema files.
-- A passenger who arrives through SSO is identified by the partner's own user id, never by email.
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_provider text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id text;
CREATE UNIQUE INDEX IF NOT EXISTS users_external_identity_idx ON users (external_provider, external_id) WHERE external_id IS NOT NULL;

-- Each SSO hand-off token can be used once: its id is recorded here and a second use of the same id is refused.
CREATE TABLE IF NOT EXISTS sso_token_uses (
  jti     text PRIMARY KEY,
  used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sso_token_uses_used_at_idx ON sso_token_uses (used_at);
