ALTER TABLE "vouchers" ADD COLUMN "xml_original" TEXT;

CREATE TABLE "electronic_documents" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "clave_acceso" TEXT NOT NULL,
  "ambiente" TEXT NOT NULL,
  "tipo_comprobante" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'FIRMADO',
  "xml_firmado" TEXT NOT NULL,
  "xml_autorizado" TEXT,
  "hash_xml" TEXT NOT NULL,
  "respuesta_recepcion" JSONB,
  "respuesta_autorizacion" JSONB,
  "ultimo_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "electronic_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "electronic_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "electronic_documents_company_id_ambiente_clave_acceso_key" ON "electronic_documents"("company_id", "ambiente", "clave_acceso");
