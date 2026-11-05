// Ejecutar con las variables del entorno de ensayo/producción; nunca imprime valores.
function preflight(env) {
  const errors = [];
  try { require('../dist/security/config').validateProduction({ ...env, NODE_ENV: 'production' }); }
  catch { errors.push('Revisar JWT_SECRET, CORS_ORIGIN y TLS estricto de DATABASE_URL.'); }
  if (!/^[a-f0-9]{64}$/i.test(env.DATA_ENCRYPTION_KEY ?? '')) errors.push('Configurar DATA_ENCRYPTION_KEY (64 caracteres hexadecimales).');
  if (!['true','false'].includes(env.ALLOW_PUBLIC_REGISTRATION ?? '')) errors.push('Definir explícitamente ALLOW_PUBLIC_REGISTRATION.');
  const provider = env.MAIL_PROVIDER;
  if (provider === 'gmail') {
    if (!/^[^\s@]+@gmail\.com$/i.test(env.GMAIL_USER ?? '') || !/^[a-zA-Z0-9]{16}$/.test((env.GMAIL_APP_PASSWORD ?? '').replace(/\s/g,''))) errors.push('Revisar GMAIL_USER y la contraseña de aplicación GMAIL_APP_PASSWORD.');
  } else if (provider === 'resend') {
    if (!env.RESEND_API_KEY || !env.MAIL_FROM) errors.push('Completar RESEND_API_KEY y MAIL_FROM.');
  } else errors.push('Configurar el proveedor de recuperación de contraseña.');
  try {
    const recovery = new URL(env.PASSWORD_RESET_URL);
    const allowed = (env.CORS_ORIGIN ?? '').split(',').map(s => s.trim());
    if (recovery.protocol !== 'https:' || !allowed.includes(recovery.origin) || recovery.username || recovery.password || recovery.hash || recovery.search)
      throw new Error();
  } catch { errors.push('PASSWORD_RESET_URL debe ser HTTPS y pertenecer a un origen permitido.'); }
  if (env.SRI_ENVIRONMENT === 'produccion' && env.SRI_ENABLE_PRODUCTION !== 'true') errors.push('Ambiente SRI de producción seleccionado sin habilitación.');
  return { ready: errors.length === 0, errors };
}
module.exports = { preflight };
if (require.main === module) { const result = preflight(process.env); console.log(JSON.stringify(result, null, 2)); if (!result.ready) process.exitCode = 1; }
