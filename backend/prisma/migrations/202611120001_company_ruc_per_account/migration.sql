ALTER TABLE "companies" ADD COLUMN "owner_user_id" TEXT;

-- Preserve company IDs and memberships. Prefer the creator when still a member;
-- otherwise use an existing administrator/member, never an unrelated account.
UPDATE "companies" c SET "owner_user_id" = COALESCE(
  (SELECT a."user_id" FROM "audit_logs" a
   WHERE a."company_id" = c."id" AND a."accion" = 'CREAR_EMPRESA'
     AND EXISTS (SELECT 1 FROM "company_users" cu WHERE cu."company_id" = c."id" AND cu."user_id" = a."user_id")
   ORDER BY a."created_at", a."id" LIMIT 1),
  (SELECT cu."user_id" FROM "company_users" cu JOIN "roles" r ON r."id" = cu."role_id"
   WHERE cu."company_id" = c."id"
   ORDER BY CASE WHEN r."nombre" IN ('ADMIN_EMPRESA', 'SUPER_ADMIN') THEN 0 ELSE 1 END, cu."id" LIMIT 1)
);

ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "companies_owner_user_id_ruc_key" ON "companies"("owner_user_id", "ruc");
CREATE INDEX "companies_ruc_idx" ON "companies"("ruc");
DROP INDEX "companies_ruc_key";
