const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const root = path.resolve(__dirname, '..');
function connection() {
  const env = dotenv.parse(fs.readFileSync(path.join(root, '.env.neon')));
  let url;
  try { url = new URL(env.DATABASE_URL || ''); } catch { throw new Error('Guarda una URL PostgreSQL válida en DATABASE_URL de .env.neon.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech') || !url.username || !url.password || url.pathname === '/') throw new Error('La conexión debe ser una URL de Neon con usuario, contraseña y base.');
  if (url.hostname.includes('-pooler.')) throw new Error('Usa la conexión directa de Neon, con Connection pooling desactivado.');
  url.searchParams.set('sslmode', 'require');
  url.searchParams.set('sslaccept', 'strict');
  url.searchParams.set('connect_timeout', '30');
  return url.toString();
}
async function inspect(url) {
  const db = new PrismaClient({datasources:{db:{url}},log:[]});
  try {
    await db.$queryRaw`SELECT 1`;
    const tables = await db.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`;
    const has = n => tables.some(t => t.table_name === n);
    const counts = {};
    if (has('users')) counts.users = await db.user.count();
    if (has('companies')) counts.companies = await db.company.count();
    if (has('vouchers')) counts.vouchers = await db.voucher.count();
    return { connected: true, tables: tables.map(t=>t.table_name), counts };
  } finally {await db.$disconnect();}
}
module.exports = {connection,inspect};
if(require.main===module) (async()=> {
  let url;
  try {url=connection();} catch(e) {console.error(e.message);process.exitCode=1;return;}
  try {
    console.log(JSON.stringify({neon:await inspect(url)}));
    if(process.argv.includes('--local')) {
      const env=dotenv.parse(fs.readFileSync(path.join(root,'.env')));
      const local = new URL(env.DATABASE_URL);
      if(!['127.0.0.1','localhost'].includes(local.hostname)) {console.log('La conexión activa ya es remota.');return;}
      console.log(JSON.stringify({local:await inspect(local.toString())}));
    }
  }
  catch {console.error('No se pudo conectar a Neon. Revisa la URL, el estado del proyecto y el acceso de red. No se modificó la conexión activa.');process.exitCode=1;}
})();
