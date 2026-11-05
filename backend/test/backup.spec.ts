import { randomBytes, createCipheriv } from 'crypto';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
const { encryptBackup } = require('../scripts/encrypt-backup.cjs');
const { decryptBackup } = require('../scripts/decrypt-backup.cjs');
describe('Recuperación de copia cifrada', () => {
  it('recupera un flujo producido por la herramienta de copia real', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'backup-roundtrip-'));
    try {
      const key = randomBytes(32).toString('hex');
      const data = randomBytes(200000);
      await encryptBackup(Readable.from(data), join(dir,'backup.enc'), key);
      await decryptBackup(join(dir,'backup.enc'), join(dir,'backup.dump'), key);
      expect(readFileSync(join(dir,'backup.dump'))).toEqual(data);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('autentica el dump, no sobrescribe y limpia archivos alterados', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'backup-test-'));
    try {
      const key = randomBytes(32), iv = randomBytes(12), plain = Buffer.from('PGDMP prueba');
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([Buffer.from('STB1'), iv, cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
      const source = join(dir, 'backup.enc'), target = join(dir, 'restored.dump');
      writeFileSync(source, data);
      await decryptBackup(source, target, key.toString('hex'));
      expect(readFileSync(target)).toEqual(plain);
      await expect(decryptBackup(source, target, key.toString('hex'))).rejects.toThrow();
      data[data.length - 1] ^= 1;
      writeFileSync(source, data);
      await expect(decryptBackup(source, join(dir, 'invalid.dump'), key.toString('hex'))).rejects.toThrow();
      expect(existsSync(join(dir, 'invalid.dump'))).toBe(false);
      expect(readdirSync(dir).some(f => f.endsWith('.partial'))).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
