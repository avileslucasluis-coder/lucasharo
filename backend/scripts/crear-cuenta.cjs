const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const { isEmail } = require('class-validator');

async function createAccount(input) {
  const url = new URL(input.databaseUrl);
  if (!url.hostname.endsWith('.neon.tech') || url.searchParams.get('sslmode') !== 'require' || url.searchParams.get('sslaccept') !== 'strict') {
    throw new Error('Usa la conexion de Neon con sslmode=require y sslaccept=strict.');
  }
  const ruc = String(input.ruc || '').trim();
  if (!/^(?:[0-9]{10}|[0-9]{13})$/.test(ruc)) throw new Error('Identificacion invalida: cedula de 10 digitos o RUC de 13 digitos.');
  const email = String(input.email || '').trim();
  const nombre = String(input.nombre || '').trim();
  const password = String(input.password || '');
  if (!isEmail(email) || email.length > 254) throw new Error('Correo invalido.');
  if (!nombre || nombre.length > 160) throw new Error('El nombre debe tener entre 1 y 160 caracteres.');
  if (Array.from(password).length < 8 || Array.from(password).length > 10) throw new Error('La clave debe contener entre 8 y 10 caracteres.');
  const prisma = new PrismaClient({ datasources: { db: { url: input.databaseUrl } } });
  try {
    if (await prisma.user.findUnique({ where: { email } })) {
      throw new Error('Ese correo ya tiene una cuenta. No se modifico su clave.');
    }
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({ data: { ruc, email, nombre, passwordHash } });
    console.log('Cuenta creada correctamente. Ya puedes iniciar sesion con tu cedula o RUC y clave.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { data += chunk; });
  process.stdin.on('end', async () => {
    try { await createAccount(JSON.parse(data)); }
    catch (error) {
      const safe = ['Identificacion invalida', 'Usa la conexion', 'Correo invalido', 'El nombre debe', 'La clave debe', 'Ese correo ya'];
      console.error(safe.some(prefix => error.message.startsWith(prefix)) ? error.message : 'No se pudo crear la cuenta. Revisa la conexion, la clave de Neon y las migraciones.');
      process.exitCode = 1;
    }
  });
}
module.exports = { createAccount };

