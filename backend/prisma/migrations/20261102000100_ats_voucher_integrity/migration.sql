BEGIN;
-- No corregir silenciosamente referencias antiguas ni eliminar registros.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM ats_operations o
    LEFT JOIN vouchers v ON v.id = o.voucher_id AND v.company_id = o.company_id
    WHERE o.voucher_id IS NOT NULL AND v.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay operaciones ATS con referencias inexistentes o de otra empresa. Revisar antes de migrar.';
  END IF;
END $$;
CREATE UNIQUE INDEX vouchers_company_id_id_key ON vouchers(company_id, id);
ALTER TABLE ats_operations ADD CONSTRAINT ats_operations_company_id_voucher_id_fkey
  FOREIGN KEY (company_id, voucher_id) REFERENCES vouchers(company_id, id)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
COMMIT;
