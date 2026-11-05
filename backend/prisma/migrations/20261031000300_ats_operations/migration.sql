CREATE TABLE "ats_operations" (
 "id" TEXT PRIMARY KEY, "company_id" TEXT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
 "mes" INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12), "anio" INTEGER NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
 "kind" TEXT NOT NULL, "reference" TEXT NOT NULL, "identity" TEXT NOT NULL, "voucher_id" TEXT,
 "data" JSONB NOT NULL, "version" INTEGER NOT NULL DEFAULT 1, "actor_id" TEXT NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 UNIQUE ("company_id", "mes", "anio", "identity"), UNIQUE ("company_id", "mes", "anio", "voucher_id")
);
