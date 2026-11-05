-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "revocado" BOOLEAN NOT NULL DEFAULT false,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ip" TEXT,
    "exitoso" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "ruc" TEXT NOT NULL,
    "razon_social" TEXT NOT NULL,
    "nombre_comercial" TEXT,
    "regimen" TEXT NOT NULL,
    "actividad_economica" TEXT,
    "obligado_llevar_contabilidad" BOOLEAN,
    "es_contribuyente_especial" BOOLEAN,
    "es_agente_retencion" BOOLEAN,
    "direccion" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_users" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,

    CONSTRAINT "company_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "establishments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "direccion" TEXT,

    CONSTRAINT "establishments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "identificacion" TEXT NOT NULL,
    "razon_social" TEXT NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "identificacion" TEXT NOT NULL,
    "razon_social" TEXT NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rules" (
    "id" TEXT NOT NULL,
    "regimen" TEXT NOT NULL,
    "obligacion" TEXT NOT NULL,
    "formulario" TEXT,
    "condicion" TEXT NOT NULL,
    "periodicidad" TEXT NOT NULL,
    "base_legal" TEXT NOT NULL,
    "vigencia_desde" TIMESTAMP(3) NOT NULL,
    "vigencia_hasta" TIMESTAMP(3),
    "estado" TEXT NOT NULL DEFAULT 'ACTIVA',
    "observaciones" TEXT,

    CONSTRAINT "tax_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_obligations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "mes" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "formulario" TEXT,
    "periodicidad" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "base_legal" TEXT NOT NULL,
    "fecha_vencimiento" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "tipo_comprobante" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "clave_acceso" TEXT NOT NULL,
    "ruc_emisor" TEXT NOT NULL,
    "razon_social_emisor" TEXT NOT NULL,
    "identificacion_contraparte" TEXT,
    "razon_social_contraparte" TEXT,
    "fecha_emision" TIMESTAMP(3) NOT NULL,
    "base_imponible_iva" DECIMAL(12,2) NOT NULL,
    "base_imponible_iva0" DECIMAL(12,2) NOT NULL,
    "monto_iva" DECIMAL(12,2) NOT NULL,
    "monto_renta_retenida" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "importe_total" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withholdings" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "voucher_id" TEXT NOT NULL,
    "codigo_retencion_iva" TEXT NOT NULL,
    "porcentaje_iva" DECIMAL(5,4) NOT NULL,
    "valor_retenido_iva" DECIMAL(12,2) NOT NULL,
    "codigo_retencion_renta" TEXT NOT NULL,
    "porcentaje_renta" DECIMAL(5,4) NOT NULL,
    "valor_retenido_renta" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "withholdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_declarations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "mes" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "total_ventas_gravadas" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_ventas_0" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_iva_ventas" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_compras_gravadas" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_compras_0" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_iva_compras" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_iva_retenido_en_ventas" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_retenciones_iva_aplicadas" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_retenciones_renta_aplicadas" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "fecha_generacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_presentacion" TIMESTAMP(3),

    CONSTRAINT "tax_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ats_reports" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "mes" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "usuario_id" TEXT,
    "version_catalogo" TEXT NOT NULL,
    "version_xsd" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "hash_archivo" TEXT,
    "errores_json" JSONB,
    "advertencias_json" JSONB,
    "fecha_generacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ats_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "company_id" TEXT,
    "accion" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "registro_id" TEXT,
    "valor_anterior" JSONB,
    "valor_nuevo" JSONB,
    "ip" TEXT,
    "resultado" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_nombre_key" ON "roles"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_codigo_key" ON "permissions"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "companies_ruc_key" ON "companies"("ruc");

-- CreateIndex
CREATE UNIQUE INDEX "company_users_company_id_user_id_key" ON "company_users"("company_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "establishments_company_id_codigo_key" ON "establishments"("company_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "customers_company_id_identificacion_key" ON "customers"("company_id", "identificacion");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_company_id_identificacion_key" ON "suppliers"("company_id", "identificacion");

-- CreateIndex
CREATE UNIQUE INDEX "tax_obligations_company_id_mes_anio_tipo_key" ON "tax_obligations"("company_id", "mes", "anio", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_company_id_clave_acceso_key" ON "vouchers"("company_id", "clave_acceso");

-- CreateIndex
CREATE UNIQUE INDEX "withholdings_voucher_id_key" ON "withholdings"("voucher_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_declarations_company_id_mes_anio_key" ON "tax_declarations"("company_id", "mes", "anio");

-- CreateIndex
CREATE UNIQUE INDEX "ats_reports_company_id_mes_anio_key" ON "ats_reports"("company_id", "mes", "anio");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_history" ADD CONSTRAINT "login_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "establishments" ADD CONSTRAINT "establishments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_obligations" ADD CONSTRAINT "tax_obligations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withholdings" ADD CONSTRAINT "withholdings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withholdings" ADD CONSTRAINT "withholdings_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_declarations" ADD CONSTRAINT "tax_declarations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ats_reports" ADD CONSTRAINT "ats_reports_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
