// Recupera el dump para un ensayo de restauración. Nunca conecta ni modifica una BD.
const fs = require('node:fs');
const path = require('node:path');
const { createDecipheriv, randomUUID } = require('node:crypto');
const { pipeline } = require('node:stream/promises');
async function decryptBackup(input, output, key) {
  key = typeof key === 'string' ? key.trim() : key;
  if (!/^[a-f0-9]{64}$/i.test(key ?? '')) throw new Error('Clave inválida.');
  const source = path.resolve(input), target = path.resolve(output);
  if (source === target || fs.existsSync(target)) throw new Error('El destino debe ser un archivo nuevo.');
  const size = fs.statSync(source).size;
  if (size < 33) throw new Error('Copia incompleta.');
  const fd = fs.openSync(source, 'r'), header = Buffer.alloc(16), tag = Buffer.alloc(16);
  try { fs.readSync(fd, header, 0, 16, 0); fs.readSync(fd, tag, 0, 16, size - 16); } finally { fs.closeSync(fd); }
  if (header.subarray(0, 4).toString() !== 'STB1') throw new Error('Formato desconocido.');
  const temp = target + '.' + randomUUID() + '.partial';
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), header.subarray(4));
  decipher.setAuthTag(tag);
  try {
    await pipeline(fs.createReadStream(source, { start: 16, end: size - 17 }), decipher, fs.createWriteStream(temp, { flags: 'wx', mode: 0o600 }));
    // Enlace exclusivo: no sobrescribir un destino creado mientras se descifraba.
    fs.linkSync(temp, target);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
module.exports = { decryptBackup };
if (require.main === module) {
  decryptBackup(process.argv[2], process.argv[3], process.env.BACKUP_ENCRYPTION_KEY)
    .then(() => console.log('Dump recuperado. Restaura primero en una base de ensayo vacía. El archivo resultante contiene datos sin cifrar.'))
    .catch(() => { console.error('No se recuperó el dump: verifica clave, archivo y destino nuevo.'); process.exitCode = 1; });
}
