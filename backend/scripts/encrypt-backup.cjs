const { createCipheriv, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const { pipeline } = require('node:stream/promises');
async function encryptBackup(source, target, key) {
  key = typeof key === 'string' ? key.trim() : key;
  if (!/^[a-f0-9]{64}$/i.test(key ?? '')) throw new Error('Clave de copia inválida.');
  const iv = randomBytes(12), fd = fs.openSync(target, 'wx', 0o600);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  try {
    fs.writeSync(fd, Buffer.concat([Buffer.from('STB1'), iv]));
    await pipeline(source, cipher, fs.createWriteStream(target, { fd, autoClose: true, start: 16 }));
    fs.appendFileSync(target, cipher.getAuthTag());
  } catch (error) {
    try { fs.closeSync(fd); } catch {}
    try { fs.unlinkSync(target); } catch {}
    throw error;
  }
}
module.exports = { encryptBackup };
