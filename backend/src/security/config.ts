export function jwtSecret(value?: string): string {
  if (!value || value.length < 48 || /CAMBIAR|REEMPLAZAR/i.test(value)) {
    throw new Error('JWT_SECRET debe ser un secreto aleatorio de al menos 48 caracteres.');
  }
  return value;
}

export function validateProduction(env: NodeJS.ProcessEnv): void {
  jwtSecret(env.JWT_SECRET);
  if (env.NODE_ENV !== 'production') return;
  const origins = (env.CORS_ORIGIN ?? '').split(',');
  if (!origins.length || origins.some(origin => {
    try { const url = new URL(origin.trim()); return url.protocol !== 'https:' || url.origin !== origin.trim(); }
    catch { return true; }
  })) throw new Error('CORS_ORIGIN requiere orígenes HTTPS explícitos en producción.');
  const db = new URL(env.DATABASE_URL ?? '');
  if (!['require', 'verify-ca', 'verify-full'].includes(db.searchParams.get('sslmode') ?? '') || db.searchParams.get('sslaccept') !== 'strict') {
    throw new Error('PostgreSQL requiere TLS con validación de certificado en producción.');
  }
}
