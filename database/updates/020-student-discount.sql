-- Student fare discount (20%, like Senior Citizen and PWD). Idempotent: a fresh install also runs this after the schema files.
-- The kind of discount is now senior | pwd | student, on the account and on the ticket.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_discount_type_check;
ALTER TABLE users ADD CONSTRAINT users_discount_type_check CHECK (discount_type IN ('senior', 'pwd', 'student'));
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_discount_type_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_discount_type_check CHECK (discount_type IN ('senior', 'pwd', 'student'));
