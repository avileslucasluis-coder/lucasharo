-- Only the explicit company deletion transaction may remove its decision history.
-- Ordinary edits/deletions of decisions remain forbidden.
CREATE OR REPLACE FUNCTION protect_period_decision_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('dayanex.deleting_company', true) = OLD.company_id THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'El historial de decisiones no se modifica; crea otra versión.';
END $$;
