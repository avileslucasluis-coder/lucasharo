// Inspección de solo lectura. La conexión se recibe por DATABASE_URL y nunca se imprime.
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createHash } = require('node:crypto');

function expectedMigrations() {
  const root = join(__dirname, '../prisma/migrations');
  return readdirSync(root, { withFileTypes:true }).filter(entry => entry.isDirectory()).map(entry => {
    const sql = readFileSync(join(root,entry.name,'migration.sql'),'utf8');
    const lf = sql.replace(/\r\n/g,'\n');
    const hash = value => createHash('sha256').update(value).digest('hex');
    return {name:entry.name,checksum:hash(sql),compatibleChecksums:[hash(lf),hash(lf.replace(/\n/g,'\r\n'))]};
  });
}

async function checkDatabase(client, expected = expectedMigrations()) {
  try {
    const applied = await client.$queryRaw`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"`;
    const pending = [], modified = [], failed = [];
    for (const migration of expected) {
      const attempts = applied.filter(row => row.migration_name === migration.name && !row.rolled_back_at);
      if (attempts.some(row => !row.finished_at)) failed.push(migration.name);
      const successful = attempts.find(row => row.finished_at);
      if (!successful) pending.push(migration.name);
      else if (![migration.checksum,...(migration.compatibleChecksums ?? [])].includes(successful.checksum)) modified.push(migration.name);
    }
    // SELECT con LIMIT 0 comprueba las columnas sin leer registros de contribuyentes.
    if (!pending.length && !modified.length && !failed.length) {
      await client.$queryRaw`SELECT "id", "company_id", "mes", "anio", "kind", "reference", "identity", "voucher_id", "data", "version", "actor_id", "created_at", "updated_at" FROM "ats_operations" LIMIT 0`;
      await client.$queryRaw`SELECT "fecha_registro_ats" FROM "vouchers" LIMIT 0`;
    }
    return { ready:!pending.length && !modified.length && !failed.length, pending, modified, failed };
  } catch {
    return {ready:false, errors:['No se pudo verificar el esquema. Revisa la conexión, los permisos de lectura y las migraciones.']};
  }
}

module.exports = {checkDatabase,expectedMigrations};
if (require.main === module) {
  (async () => {
    if (!process.env.DATABASE_URL) {
      console.log(JSON.stringify({ready:false,errors:['Define DATABASE_URL en esta sesión para verificar la base.']},null,2));
      process.exitCode = 1;
      return;
    }
    const {PrismaClient} = require('@prisma/client');
    const client = new PrismaClient({log:[]});
    try {
      const result = await checkDatabase(client);
      console.log(JSON.stringify(result,null,2));
      if (!result.ready) process.exitCode = 1;
    } finally { await client.$disconnect(); }
  })().catch(() => { console.error('No se pudo completar la comprobación de la base.'); process.exitCode = 1; });
}
