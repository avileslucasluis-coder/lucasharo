ALTER TABLE "tax_declarations" ADD COLUMN "periodicidad" TEXT NOT NULL DEFAULT 'MENSUAL';
DROP INDEX "tax_declarations_company_id_mes_anio_key";
CREATE UNIQUE INDEX "tax_declarations_company_id_mes_anio_periodicidad_key"
  ON "tax_declarations"("company_id", "mes", "anio", "periodicidad");
ALTER TABLE "tax_declarations" ADD CONSTRAINT "declaration_periodicity_valid"
  CHECK ("periodicidad" = 'MENSUAL' OR ("periodicidad" = 'SEMESTRAL' AND "mes" IN (6, 12)));
