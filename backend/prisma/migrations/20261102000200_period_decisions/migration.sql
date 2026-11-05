CREATE TABLE period_decisions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  voucher_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  choice TEXT NOT NULL CHECK (choice IN ('EMISION','REGISTRO','PENDIENTE')),
  proposed_period TEXT,
  justification TEXT NOT NULL,
  evidence TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  source_snapshot JSONB NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id,voucher_id) REFERENCES vouchers(company_id,id) ON DELETE RESTRICT,
  UNIQUE(company_id,voucher_id,version)
);
-- Las decisiones se rectifican creando una versión, nunca sobrescribiéndola.
CREATE FUNCTION protect_period_decision_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'El historial de decisiones no se modifica; crea otra versión.';
END $$;
CREATE TRIGGER period_decisions_immutable BEFORE UPDATE OR DELETE ON period_decisions
FOR EACH ROW EXECUTE FUNCTION protect_period_decision_history();
