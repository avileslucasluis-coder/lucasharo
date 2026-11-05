ALTER TABLE "vouchers" ADD COLUMN "fecha_registro_ats" TIMESTAMP(3);
CREATE INDEX "vouchers_company_accounting_date" ON "vouchers" ("company_id", "fecha_registro_ats");
