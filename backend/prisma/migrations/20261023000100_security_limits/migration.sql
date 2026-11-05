CREATE TABLE "security_rate_limits" (
  "key" TEXT PRIMARY KEY,
  "attempts" INTEGER NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "security_rate_limits_expires_at_idx" ON "security_rate_limits"("expires_at");
