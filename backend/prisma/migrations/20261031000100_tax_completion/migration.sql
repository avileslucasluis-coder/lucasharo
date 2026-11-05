ALTER TABLE "tax_declarations" ADD COLUMN "ajustes" JSONB, ADD COLUMN "liquidacion" JSONB;
ALTER TABLE "tax_declarations" DROP CONSTRAINT "declaration_periodicity_valid";
ALTER TABLE "tax_declarations" ADD CONSTRAINT "declaration_periodicity_valid" CHECK (
  "periodicidad" = 'MENSUAL' OR ("periodicidad" = 'SEMESTRAL' AND "mes" IN (6,12)) OR ("periodicidad" = 'ANUAL' AND "mes" = 12));
CREATE TABLE "tax_filings" (
  "id" TEXT PRIMARY KEY, "declaration_id" TEXT NOT NULL REFERENCES "tax_declarations"("id") ON DELETE RESTRICT,
  "revision" INTEGER NOT NULL, "tipo" TEXT NOT NULL, "formulario" TEXT NOT NULL, "numero" TEXT NOT NULL, "fecha" TIMESTAMP(3) NOT NULL,
  "valor" DECIMAL(12,2) NOT NULL, "actor_id" TEXT NOT NULL, "observacion" TEXT NOT NULL,
  "archivo_cifrado" TEXT, "hash_archivo" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "filing_value" CHECK ("valor" >= 0), CONSTRAINT "filing_type" CHECK ("tipo" IN ('PRESENTACION','PAGO')),
  UNIQUE ("declaration_id", "tipo", "numero")
);
ALTER TABLE "vouchers" ADD COLUMN "ats_revision" JSONB;
ALTER TABLE "tax_obligations" ADD COLUMN "revision_vencimiento" JSONB;
