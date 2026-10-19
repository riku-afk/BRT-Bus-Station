-- Insert-only evidence tables (scans, payment_events) attach this trigger: UPDATE and DELETE are refused.
-- Usage:
--   CREATE TRIGGER <table>_insert_only BEFORE UPDATE OR DELETE ON <table>
--     FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
CREATE OR REPLACE FUNCTION forbid_update_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is insert-only: % is not allowed', TG_TABLE_NAME, TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
