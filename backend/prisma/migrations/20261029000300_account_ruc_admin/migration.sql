ALTER TABLE "users" ADD COLUMN "ruc" TEXT;
ALTER TABLE "users" ADD COLUMN "platform_admin" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "users_ruc_key" ON "users"("ruc");
ALTER TABLE "users" ADD CONSTRAINT "users_ruc_format" CHECK ("ruc" IS NULL OR "ruc" ~ '^[0-9]{13}$');
