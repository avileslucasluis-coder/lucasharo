CREATE TABLE "declaration_revisions" (
  "id" TEXT NOT NULL,
  "declaration_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "actor_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "previous" JSONB,
  "snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "declaration_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "declaration_revisions_declaration_id_fkey" FOREIGN KEY ("declaration_id")
    REFERENCES "tax_declarations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "declaration_revisions_declaration_id_version_key"
  ON "declaration_revisions"("declaration_id", "version");
