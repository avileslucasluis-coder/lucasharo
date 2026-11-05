// Lee JSON por entrada estándar; no recibe contraseñas en argumentos ni crea claves por defecto.
const { PrismaClient } = require('@prisma/client');
const messages = {
  INPUT: 'Faltan correo, conexion o la confirmacion DESIGNAR ADMINISTRADOR.',
  URL: 'Conexion invalida. Pega solo la direccion postgresql://, sin psql ni comillas.',
  TLS: 'La conexion remota requiere sslmode=require y sslaccept=strict. Agrega &sslaccept=strict al final si falta.',
  ACCOUNT: 'No existe una cuenta con ese correo en esta base. Registrate primero en Sistema Tributario con ese correo.',
  INACTIVE: 'La cuenta existe pero esta suspendida. No se modificaron sus permisos.',
  P1000: 'Neon rechazo las credenciales. Copia nuevamente la conexion desde Connect.',
  P1001: 'No se pudo conectar con Neon. Revisa la conexion y el acceso a Internet.',
  P1002: 'La conexion con la base agoto el tiempo de espera. Intenta nuevamente.',
  P1011: 'No se pudo establecer TLS. Revisa los parametros SSL de la conexion.',
  P1013: 'La cadena de conexion no tiene un formato valido.',
  P2021: 'Faltan tablas en esta base. Deben aplicarse las migraciones pendientes antes de activar al administrador.',
  P2022: 'Faltan columnas en esta base. Deben aplicarse las migraciones pendientes, incluida account_ruc_admin.',
  P2024: 'Se agoto el tiempo para obtener una conexion. Intenta nuevamente.',
};
function fail(code) { const error = new Error(code); error.safeCode = code; throw error; }
function safeError(error) {
  if (error instanceof SyntaxError) return 'No se pudieron leer los datos enviados por PowerShell. Ejecuta el asistente actualizado.';
  return messages[error?.safeCode] || messages[error?.code] || messages[error?.errorCode] ||
    'No se pudo activar al administrador. No se muestran detalles internos para proteger la conexion.';
}
function parseInput(data) {
  // Windows PowerShell 5.1 puede anteponer BOM al enviar UTF-8 por una tuberia.
  return JSON.parse(data.replace(/^\uFEFF/, '').trim());
}
function connection(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch { fail('URL'); }
  if (!['postgresql:', 'postgres:'].includes(url.protocol)) fail('URL');
  if (!['localhost', '127.0.0.1'].includes(url.hostname) &&
      (!['require', 'verify-full'].includes(url.searchParams.get('sslmode')) || url.searchParams.get('sslaccept') !== 'strict')) fail('TLS');
  return url.toString();
}
async function designate(input) {
  if (!input?.databaseUrl || typeof input.email !== 'string' || !input.email.trim() || input.confirm !== 'DESIGNAR ADMINISTRADOR') fail('INPUT');
  const databaseUrl = connection(input.databaseUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(290003)`;
      const user = await tx.user.findUnique({ where: { email: input.email.trim() } });
      if (!user) fail('ACCOUNT');
      if (!user.activo) fail('INACTIVE');
      await tx.user.update({ where: { id: user.id }, data: { platformAdmin: true, sessionVersion: { increment: 1 } } });
      await tx.refreshToken.updateMany({ where: { userId: user.id }, data: { revocado: true } });
      await tx.auditLog.create({ data: { userId: user.id, registroId: user.id, accion: 'DESIGNAR_ADMINISTRADOR', modulo: 'ADMIN', resultado: 'OK' } });
    }, { maxWait: 10000, timeout: 20000 });
    console.log('Administrador designado. Inicia sesión de nuevo.');
  } finally { await prisma.$disconnect(); }
}
if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => data += chunk);
  process.stdin.on('end', () => Promise.resolve().then(() => designate(parseInput(data))).catch(error => {
    console.error(safeError(error)); process.exitCode = 1;
  }));
}
module.exports = { designate, connection, safeError, parseInput };
