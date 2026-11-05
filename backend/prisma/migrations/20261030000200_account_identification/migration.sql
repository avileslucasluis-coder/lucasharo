ALTER TABLE "users" DROP CONSTRAINT "users_ruc_format";
ALTER TABLE "users" ADD CONSTRAINT "users_ruc_format"
  CHECK ("ruc" IS NULL OR "ruc" ~ '^([0-9]{10}|[0-9]{13})$');
