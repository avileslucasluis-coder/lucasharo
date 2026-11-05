// Restaura únicamente en un contenedor nuevo y desechable; nunca acepta una BD destino.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { decryptBackup } = require('./decrypt-backup.cjs');

async function verifyBackup(file, key) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tributario-restore-'));
  const name = 'tributario-restore-' + randomUUID();
  let created = false;
  const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'], timeout: 180000, windowsHide: true });
  try {
    await decryptBackup(file, path.join(dir, 'restore.dump'), key);
    const env = { ...process.env, POSTGRES_PASSWORD: randomBytes(32).toString('hex') };
    execFileSync('docker', ['run', '--detach', '--rm', '--name', name, '--network', 'none', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB=restore_test',
      '--mount', `type=bind,source=${dir},target=/backup,readonly`, 'postgres:18-alpine'], { env, stdio: 'pipe', timeout: 180000, windowsHide: true });
    created = true;
    for (let i = 0; i < 60; i++) {
      try { docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); break; }
      catch { if (i === 59) throw new Error('No inició la base de ensayo.'); await new Promise(r => setTimeout(r, 500)); }
    }
    docker(['exec', name, 'pg_restore', '--exit-on-error', '--no-owner', '--no-acl', '-U', 'postgres', '-d', 'restore_test', '/backup/restore.dump']);
    const result = docker(['exec', name, 'psql', '-U', 'postgres', '-d', 'restore_test', '-At', '-v', 'ON_ERROR_STOP=1', '-c',
      `SELECT json_build_object('users',(SELECT count(*) FROM users),'companies',(SELECT count(*) FROM companies),'declarations',(SELECT count(*) FROM tax_declarations),'pendingMigrations',(SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL))`]);
    const counts = JSON.parse(result.trim());
    if (counts.pendingMigrations !== 0) throw new Error('La copia contiene migraciones incompletas.');
    return { restored: true, ...counts };
  } finally {
    try { if (created) docker(['rm', '--force', name]); }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
}
module.exports = { verifyBackup };
if (require.main === module) verifyBackup(process.argv[2], process.env.BACKUP_ENCRYPTION_KEY)
  .then(result => console.log(JSON.stringify(result)))
  .catch(() => { console.error('Falló el ensayo de restauración. No se modificó ninguna base externa.'); process.exitCode = 1; });
