// Copia PostgreSQL directamente a un archivo AES-256-GCM, sin volcar texto plano.
// Requiere Docker; DATABASE_URL y BACKUP_ENCRYPTION_KEY se reciben del entorno.
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { encryptBackup } = require('./encrypt-backup.cjs');

let stage = 'validación de clave';
async function main() {
  process.env.BACKUP_ENCRYPTION_KEY = (process.env.BACKUP_ENCRYPTION_KEY ?? '').trim();
  if (!/^[a-f0-9]{64}$/i.test(process.env.BACKUP_ENCRYPTION_KEY ?? '')) throw new Error('Falta BACKUP_ENCRYPTION_KEY de 64 caracteres hexadecimales.');
  stage = 'validación de conexión y TLS';
  const url = new URL((process.env.DATABASE_URL ?? '').trim());
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Conexión PostgreSQL inválida.');
  if (url.searchParams.get('sslmode') !== 'require' && url.searchParams.get('sslmode') !== 'verify-full') throw new Error('La copia remota requiere TLS.');
  const target = path.resolve(process.argv[2] ?? 'backup.enc');
  if (fs.existsSync(target)) throw new Error('El destino ya existe.');
  const temporary = target + '.' + randomUUID() + '.partial';
  const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: 'verify-full', PGSSLROOTCERT: 'system', PGCONNECT_TIMEOUT: '30' };
  stage = 'conexión PostgreSQL y pg_dump';
  const child = spawn('docker', ['run', '--rm', '-i', ...['PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSSLMODE','PGSSLROOTCERT','PGCONNECT_TIMEOUT'].flatMap(k => ['-e', k]),
    'postgres:18-alpine', 'pg_dump', '--format=custom', '--no-owner', '--no-acl'], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  // No imprimir stderr: puede contener información de la conexión.
  child.stderr.resume();
  const completion = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error('pg_dump falló; no se conservó una copia incompleta.'))); });
  try {
    await Promise.all([encryptBackup(child.stdout, temporary, process.env.BACKUP_ENCRYPTION_KEY), completion]);
    fs.linkSync(temporary, target);
    console.log('Copia cifrada completada. Guarda la clave separada del archivo.');
  } catch (error) {
    child.kill();
    throw error;
  } finally {
    try { fs.unlinkSync(temporary); } catch {}
  }
}
main().catch(() => { console.error('No se pudo crear la copia cifrada. Etapa: ' + stage + '. Comprueba Docker, la conexión y la clave.'); process.exitCode = 1; });
