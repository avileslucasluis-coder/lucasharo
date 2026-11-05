ALTER TABLE "companies"
  ADD COLUMN "realizaVentasGravadasIva" BOOLEAN,
  ADD COLUMN "realizaVentasTarifa0" BOOLEAN,
  ADD COLUMN "realizaOperacionesExterior" BOOLEAN,
  ADD COLUMN "superaFraccionBasicaRenta" BOOLEAN,
  ADD COLUMN "realizaActividadesExcluidasRimpe" BOOLEAN,
  ADD COLUMN "tipoPersona" TEXT,
  ADD COLUMN "periodicidadIvaDeclarada" TEXT,
  ADD COLUMN "deberesFormalesRegistrados" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

INSERT INTO "permissions" ("id", "codigo", "modulo")
VALUES (gen_random_uuid()::text, 'empresas.editar_perfil', 'COMPANIES')
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."nombre" IN ('SUPER_ADMIN', 'ADMIN_EMPRESA')
AND p."codigo" = 'empresas.editar_perfil'
ON CONFLICT DO NOTHING;
