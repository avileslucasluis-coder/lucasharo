// Crea y destruye exclusivamente un contenedor propio, sin leer DATABASE_URL del .env.
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const migrationTemp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'tributario-upgrade-'));
const root = path.resolve(__dirname, '..');
const name = `dayanex-test-${randomUUID()}`;
const password = String(require('node:crypto').randomInt(10000000, 100000000));
let server, prisma, created = false, checks = 0;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const docker = args => execFileSync('docker', args, { encoding: 'utf8', timeout: 120000 }).trim();
async function freePort() {
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}
async function main() {
  docker(['run', '--detach', '--rm', '--name', name, '-p', '127.0.0.1::5432',
    '-e', `POSTGRES_PASSWORD=${password}`, '-e', 'POSTGRES_DB=dayanex_test', 'postgres:16-alpine']);
  created = true;
  const dbPort = docker(['port', name, '5432/tcp']).split(':').pop();
  for (let i = 0; i < 60; i++) {
    // La inicialización de PostgreSQL abre primero un servidor temporal por socket.
    // Esperar TCP evita lanzar migraciones antes del servidor definitivo.
    try { docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); break; }
    catch { if (i === 59) throw new Error('PostgreSQL de pruebas no inició.'); await pause(500); }
  }
  const port = await freePort();
  const env = { ...process.env, NODE_ENV: 'test', VERCEL: '', PORT: String(port),
    MAIL_PROVIDER: '', GMAIL_USER: '', GMAIL_APP_PASSWORD: '', RESEND_API_KEY: '', MAIL_FROM: '', PASSWORD_RESET_URL: '',
    DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${dbPort}/dayanex_test`,
    DATA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    JWT_SECRET: randomBytes(48).toString('hex'), CORS_ORIGIN: `http://127.0.0.1:${port}` };
  const run = args => execFileSync(process.execPath, args, { cwd: root, env, stdio: 'pipe', timeout: 120000 });
  // Ensaya el salto desde las seis migraciones originales con una cuenta existente.
  fs.copyFileSync(path.join(root, 'prisma/schema.prisma'), path.join(migrationTemp, 'schema.prisma'));
  fs.mkdirSync(path.join(migrationTemp, 'migrations'));
  fs.copyFileSync(path.join(root, 'prisma/migrations/migration_lock.toml'), path.join(migrationTemp, 'migrations/migration_lock.toml'));
  for (const migration of fs.readdirSync(path.join(root, 'prisma/migrations')).filter(n => /^2026/.test(n) && n < '20261030')) {
    fs.cpSync(path.join(root, 'prisma/migrations', migration), path.join(migrationTemp, 'migrations', migration), { recursive: true });
  }
  run(['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', path.join(migrationTemp, 'schema.prisma')]);
  const legacyId = randomUUID();
  docker(['exec', name, 'psql', '-U', 'postgres', '-d', 'dayanex_test', '-v', 'ON_ERROR_STOP=1', '-c',
    `INSERT INTO users(id,email,password_hash,nombre) VALUES ('${legacyId}','migration-fixture@example.com','not-a-login-hash','Cuenta anterior')`]);
  const legacyCompanyIds = [randomUUID(), randomUUID(), randomUUID()];
  const legacyRoleId = randomUUID();
  docker(['exec', name, 'psql', '-U', 'postgres', '-d', 'dayanex_test', '-v', 'ON_ERROR_STOP=1', '-c', `
    INSERT INTO roles(id,nombre) VALUES ('${legacyRoleId}','ADMIN_EMPRESA');
    INSERT INTO companies(id,ruc,razon_social,regimen) VALUES
      ('${legacyCompanyIds[0]}','0998888888001','Migracion creador','GENERAL'),
      ('${legacyCompanyIds[1]}','0998888887001','Migracion miembro','GENERAL'),
      ('${legacyCompanyIds[2]}','0998888886001','Migracion sin miembros','GENERAL');
    INSERT INTO company_users(id,company_id,user_id,role_id) VALUES
      ('${randomUUID()}','${legacyCompanyIds[0]}','${legacyId}','${legacyRoleId}'),
      ('${randomUUID()}','${legacyCompanyIds[1]}','${legacyId}','${legacyRoleId}');
    INSERT INTO audit_logs(id,user_id,company_id,accion,modulo,resultado) VALUES
      ('${randomUUID()}','${legacyId}','${legacyCompanyIds[0]}','CREAR_EMPRESA','COMPANIES','OK');
    INSERT INTO establishments(id,company_id,codigo) VALUES ('${randomUUID()}','${legacyCompanyIds[0]}','001');
  `]);
  run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
  for (const id of legacyCompanyIds.slice(0, 2)) {
    const owner = docker(['exec', name, 'psql', '-U', 'postgres', '-d', 'dayanex_test', '-Atc', `SELECT owner_user_id FROM companies WHERE id='${id}'`]);
    assert.equal(owner, legacyId); checks++;
  }
  assert.equal(docker(['exec', name, 'psql', '-U', 'postgres', '-d', 'dayanex_test', '-Atc', `SELECT count(*) FROM establishments WHERE company_id='${legacyCompanyIds[0]}'`]), '1'); checks++;
  assert.equal(docker(['exec', name, 'psql', '-U', 'postgres', '-d', 'dayanex_test', '-Atc', `SELECT count(*) FROM companies WHERE id='${legacyCompanyIds[2]}' AND owner_user_id IS NULL`]), '1'); checks++;
  docker(['exec', name, 'psql', '-U', 'postgres', '-d', 'dayanex_test', '-v', 'ON_ERROR_STOP=1', '-c',
    `DELETE FROM companies WHERE id IN (${legacyCompanyIds.map(id => `'${id}'`).join(',')}); DELETE FROM audit_logs WHERE user_id='${legacyId}';`]);
  const preserved = docker(['exec', name, 'psql', '-U', 'postgres', '-d', 'dayanex_test', '-Atc',
    `SELECT nombre || '|' || activo::text FROM users WHERE id='${legacyId}'`]);
  assert.equal(preserved, 'Cuenta anterior|true'); checks++;
  docker(['exec', name, 'psql', '-U', 'postgres', '-d', 'dayanex_test', '-c', `DELETE FROM users WHERE id='${legacyId}'`]);
  run(['node_modules/ts-node/dist/bin.js', 'prisma/seed.ts']);
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  const { checkDatabase } = require('./check-database.cjs');
  const databaseReadiness = await checkDatabase(prisma);
  assert.equal(databaseReadiness.ready,true,JSON.stringify(databaseReadiness)); checks++;
  let logs = '';
  server = spawn(process.execPath, ['dist/main.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  server.stdout.on('data', data => { logs = (logs + data).slice(-12000); });
  server.stderr.on('data', data => { logs = (logs + data).slice(-12000); });
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${origin}/api/health`)).ok) break; } catch {}
    if (server.exitCode !== null || i === 119) throw new Error(`API de ensayo no inició: ${logs.replaceAll(password, '[redacted]')}`);
    await pause(500);
  }
  async function req(route, token, body, status = 200, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(origin + route, { method, signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    assert.equal(response.status, status, `${method} ${route}: ${response.status} ${text}`);
    checks++;
    return text ? JSON.parse(text) : null;
  }
  const users = [];
  const recoveryPage = await fetch(origin + '/recover.html');
  assert.equal(recoveryPage.status, 200);
  assert.ok((await recoveryPage.text()).includes('id="recovery"')); checks++;
  assert.ok(recoveryPage.headers.get('content-security-policy').includes("script-src 'self'")); checks++;
  assert.equal((await fetch(origin + '/recovery.js')).status, 200); checks++;
  for (let i = 0; i < 2; i++) {
    const email = `tenant-${i}-${randomUUID()}@example.com`;
    const account = await req('/api/auth/register', null, { email, password, nombre: `Ensayo ${i}`, ruc: `099999999${i}001` }, 201);
    const company = await req('/api/companies', account.accessToken, {
      ruc: `099999999${i}001`, razonSocial: `SOLO PRUEBA ${i}`, regimen: 'GENERAL' }, 201);
    users.push({ ...account, company, email });
  }
  await req('/api/auth/login', null, { ruc: users[0].company.ruc, password }, 201);
  await req('/api/auth/login', null, { ruc: users[0].company.ruc, password: 'incorrect-password' }, 401);
  await req('/api/auth/login', null, { ruc: '123', password }, 400);
  await req('/api/auth/login', null, { ruc: users[0].company.ruc, email: users[0].email, password }, 400);
  await req('/api/auth/register', null, { email: 'duplicate@example.com', nombre: 'Duplicate', password, ruc: users[0].company.ruc }, 409);
  await req('/api/auth/register', null, { email: 'escalation@example.com', nombre: 'Escalation', password, ruc: '0999999988001', platformAdmin: true }, 400);
  await req('/api/admin/users', null, undefined, 401);
  await req('/api/admin/users', users[0].accessToken, undefined, 403);
  for (const user of users) {
    user.document = await prisma.electronicDocument.create({ data: {
      companyId: user.company.id, claveAcceso: randomUUID(), ambiente: '1', tipoComprobante: 'FACTURA',
      xmlFirmado: '<soloPruebaLocal/>', hashXml: randomBytes(32).toString('hex'),
    } });
  }
  for (const [index, user] of users.entries()) {
    const own = user.company.id, other = users[1 - index].company.id;
    await req('/api/companies/' + other + '/perfil-tributario', user.accessToken,
      { realizaVentasGravadasIva: true }, 403);
    await req('/api/companies/' + own + '/perfil-tributario', user.accessToken,
      { realizaVentasGravadasIva: 'false' }, 400);
    await req('/api/companies/' + own + '/perfil-tributario', user.accessToken,
      { realizaVentasGravadasIva: true, tipoPersona: 'SOCIEDAD',
        deberesFormalesRegistrados: ['IVA'] }, 201);
    const savedProfile = await prisma.company.findUniqueOrThrow({ where: { id: own } });
    assert.equal(savedProfile.realizaVentasGravadasIva, true); checks++;
    assert.deepEqual(savedProfile.deberesFormalesRegistrados, ['IVA']); checks++;
    await req(`/api/tax/obligations?companyId=${own}&mes=10&anio=2026`, user.accessToken);
    const deadline = { companyId: own, mes: 10, anio: 2026, tipo: 'IVA', fecha: '2026-11-30', fuente: 'https://www.sri.gob.ec/calendario-tributario', motivo: 'Fecha ficticia exclusivamente para ensayo aislado' };
    await req('/api/tax/obligations/deadline', user.accessToken, { ...deadline, companyId: other }, 403);
    await req('/api/tax/obligations/deadline', user.accessToken, { ...deadline, fecha: '2026-02-30' }, 400);
    await req('/api/tax/obligations/deadline', user.accessToken, { ...deadline, fuente: 'https://example.com' }, 400);
    await req('/api/tax/obligations/deadline', user.accessToken, deadline, 201);
    const calendar = await req(`/api/tax/obligations?companyId=${own}&mes=10&anio=2026`, user.accessToken);
    assert.equal(calendar.find(o => o.tipo === 'IVA').fechaVencimiento.slice(0,10), deadline.fecha); checks++;
    assert.equal(await prisma.auditLog.count({ where: {
      companyId: own, accion: 'ACTUALIZAR_PERFIL_TRIBUTARIO',
    } }), 1); checks++;
    const list = await req('/api/companies', user.accessToken);
    assert.deepEqual(list.map(c => c.id), [own]);
    for (const route of ['/api/vouchers', '/api/vouchers/export-excel', '/api/ats/history', '/api/ats/review', '/api/declarations/history', '/api/declarations/filings', '/api/audit', '/api/tax/obligations']) {
      await req(`${route}?companyId=${other}&mes=10&anio=2026`, user.accessToken, undefined, 403);
    }
    const exported = await req(`/api/vouchers/export-excel?companyId=${own}&mes=10&anio=2026`, user.accessToken);
    assert.equal(exported.mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.equal(Buffer.from(exported.contentBase64, 'base64').subarray(0, 2).toString(), 'PK'); checks += 2;
    for (const route of ['/api/declarations/generar', '/api/declarations/presentar', '/api/ats/validate', '/api/ats/generate', '/api/vouchers/import']) {
      await req(route, user.accessToken, { companyId: other, mes: 10, anio: 2026 }, 403);
    }
    await req(`/api/declarations/generar?companyId=${other}`, user.accessToken, { companyId: own, mes: 10, anio: 2026 }, 403);
    const declaration = await req('/api/declarations/generar', user.accessToken, { companyId: own, mes: 10, anio: 2026 }, 201);
    const filing = { companyId: own, declarationId: declaration.id, revision: declaration.revision, formulario: '104',
      tipo: 'PRESENTACION', numero: `TEST-${index}`, fecha: '2026-01-01T00:00:00.000Z', valor: '0.00', observacion: 'Ensayo aislado de respaldo',
      archivoBase64: Buffer.from('%PDF-1.7\nsolo prueba').toString('base64') };
    await req('/api/declarations/filings', user.accessToken, { ...filing, tipo: 'PAGO' }, 400);
    await req('/api/declarations/filings', user.accessToken, { ...filing, revision: 999 }, 409);
    const evidence = await req('/api/declarations/filings', user.accessToken, filing, 201);
    await req('/api/declarations/filings', user.accessToken, filing, 409);
    const downloaded = await req(`/api/declarations/filing-file?companyId=${own}&id=${evidence.id}`, user.accessToken);
    assert.equal(downloaded.archivoBase64, filing.archivoBase64); checks++;
    const stored = await prisma.taxFiling.findUniqueOrThrow({ where: { id: evidence.id } });
    assert.ok(stored.archivoCifrado.startsWith('v1.')); checks++;
    assert.ok(!stored.archivoCifrado.includes('%PDF')); checks++;
    await req(`/api/declarations/filing-file?companyId=${other}&id=${evidence.id}`, user.accessToken, undefined, 403);
    await req('/api/declarations/generar', user.accessToken, { companyId: own, mes: 12, anio: 2026, periodicidad: 'SEMESTRAL' }, 400);
    await prisma.taxFiling.delete({ where: { id: evidence.id } });
    await req(`/api/sri/documents/${randomUUID()}?companyId=${other}`, user.accessToken, undefined, 404);
    const foreignId = users[1 - index].document.id;
    await req(`/api/sri/documents/${foreignId}?companyId=${own}`, user.accessToken, undefined, 404);
    await req(`/api/sri/documents/${foreignId}/send`, user.accessToken, { companyId: own }, 404);
    await req(`/api/sri/documents/${foreignId}/authorization`, user.accessToken, { companyId: own }, 404);
    await req('/api/companies', null, undefined, 401);
    const login = await req('/api/auth/login', null, { email: user.email, password }, 201);
    const rotated = await req('/api/auth/refresh', null, { refreshToken: login.refreshToken }, 201);
    await req('/api/auth/refresh', null, { refreshToken: login.refreshToken }, 401);
    await req('/api/auth/logout', null, { refreshToken: rotated.refreshToken }, 201);
    await req('/api/auth/refresh', null, { refreshToken: rotated.refreshToken }, 401);
  }
  const count = docker(['exec', name, 'psql', '-U', 'postgres', '-d', 'dayanex_test', '-Atc', 'SELECT count(*) FROM tax_declarations']);
  assert.equal(count, '2', 'Solo deben existir las dos declaraciones autorizadas'); checks++;
  assert.equal(await prisma.voucher.count(), 0, 'Los intentos de importación ajena no crean registros'); checks++;
  const first = users[0];
  const xml = `<factura><infoTributaria><ruc>${first.company.ruc}</ruc><claveAcceso>solo-prueba-concurrente</claveAcceso></infoTributaria><infoFactura><fechaEmision>15/10/2026</fechaEmision><identificacionComprador>0999999999001</identificacionComprador><importeTotal>1.15</importeTotal><totalConImpuestos><totalImpuesto><codigo>2</codigo><baseImponible>1.00</baseImponible><valor>0.15</valor></totalImpuesto></totalConImpuestos></infoFactura></factura>`;
  const responses = await Promise.all([1, 2].map(() => fetch(origin + '/api/vouchers/import', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${first.accessToken}` },
    body: JSON.stringify({ companyId: first.company.id, xmlContent: xml }),
  })));
  const responseBodies = await Promise.all(responses.map(r => r.text()));
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 400], responseBodies.join('\n')); checks++;
  assert.equal(await prisma.voucher.count(), 1); checks++;
  const sourceVoucher = await prisma.voucher.findFirstOrThrow({ where: { companyId: first.company.id } });
  const inventory = await req(`/api/declarations/sources?companyId=${first.company.id}&mes=10&anio=2026`, first.accessToken);
  assert.equal(inventory.scope, 'SOURCE_INVENTORY_ONLY'); checks++;
  assert.equal(inventory.snapshot.documents.length, 1); checks++;
  assert.equal(inventory.changesTaxCalculation, false); checks++;
  await req(`/api/declarations/sources?companyId=${first.company.id}&mes=10&anio=2026`, users[1].accessToken, undefined, 403);
  await assert.rejects(prisma.atsOperation.create({ data: {
    companyId: users[1].company.id, voucherId: sourceVoucher.id, mes: 10, anio: 2026,
    kind: 'COMPRA_ESPECIAL', reference: 'Ensayo de integridad', identity: randomUUID(), data: {}, actorId: users[1].id ?? 'ensayo',
  } }), e => e.code === 'P2003'); checks++;
  await assert.rejects(prisma.atsOperation.create({ data: {
    companyId: first.company.id, voucherId: randomUUID(), mes: 10, anio: 2026,
    kind: 'COMPRA_ESPECIAL', reference: 'Ensayo de referencia inexistente', identity: randomUUID(), data: {}, actorId: 'ensayo',
  } }), e => e.code === 'P2003'); checks++;
  const oldPurchase = await prisma.voucher.create({ data: { ...sourceVoucher, id: randomUUID(), claveAcceso: randomUUID(), direccion: 'COMPRA', fechaEmision: new Date('2026-09-15T00:00:00Z') } });
  const operationBody = {companyId:first.company.id,mes:10,anio:2026,kind:'ANULADO',reference:'Anulación de prueba aislada',data:{tipoComprobante:'01',establecimiento:'001',puntoEmision:'001',secuencialInicio:'1',secuencialFin:'10',autorizacion:'1234567890'}};
  await req('/api/ats/operations',users[1].accessToken,operationBody,403);
  await req(`/api/ats/operation-schemas?companyId=${first.company.id}`,users[1].accessToken,undefined,403);
  const operation = await req('/api/ats/operations',first.accessToken,operationBody,201);
  await req('/api/ats/operations',first.accessToken,operationBody,409);
  await req('/api/ats/operations',first.accessToken,{...operationBody,data:{...operationBody.data,secuencialInicio:'5',secuencialFin:'15'}},409);
  await req(`/api/ats/operations?companyId=${first.company.id}&mes=10&anio=2026`,users[1].accessToken,undefined,403);
  const operationList = await req(`/api/ats/operations?companyId=${first.company.id}&mes=10&anio=2026`,first.accessToken);
  assert.equal(operationList.length,1); checks++;
  const edited = await req('/api/ats/operations',first.accessToken,{...operationBody,id:operation.id,version:1,reference:'Sustento corregido en ensayo'},201);
  assert.equal(edited.version,2); checks++;
  await req('/api/ats/operations',first.accessToken,{...operationBody,id:operation.id,version:1},409);
  await req('/api/ats/operations/remove',users[1].accessToken,{companyId:first.company.id,id:operation.id,version:2},403);
  await req('/api/ats/operations/remove',first.accessToken,{companyId:first.company.id,id:operation.id,version:1},409);
  await req('/api/ats/operations/remove',first.accessToken,{companyId:first.company.id,id:operation.id,version:2},201);
  const atsReview = { companyId: first.company.id, voucherId: oldPurchase.id, operacionLocal: true, parteRelacionada: 'NO', codSustento: '01', pagos: ['20'], observacion: 'Registro contable de ensayo', fechaRegistro: '2026-10-01' };
  await req('/api/ats/review', users[1].accessToken, atsReview, 403);
  await req('/api/ats/review', first.accessToken, { ...atsReview, fechaRegistro: '2026-09-01' }, 400);
  await req('/api/ats/review', first.accessToken, atsReview, 201);
  const september = await req(`/api/ats/review?companyId=${first.company.id}&mes=9&anio=2026`, first.accessToken);
  const october = await req(`/api/ats/review?companyId=${first.company.id}&mes=10&anio=2026`, first.accessToken);
  assert.ok(!september.some(v => v.id === oldPurchase.id)); checks++;
  assert.ok(october.some(v => v.id === oldPurchase.id)); checks++;
  await prisma.voucher.delete({ where: { id: oldPurchase.id } });
  const period = { companyId: first.company.id, mes: 10, anio: 2026 };
  const semesterPeriod = { ...period, mes: 12, periodicidad: 'SEMESTRAL' };
  const semester = await req('/api/declarations/generar', first.accessToken, semesterPeriod, 201);
  assert.equal(semester.totalIvaVentas, '0.15'); checks++;
  assert.equal(semester.periodoDesde, '2026-07-01'); checks++;
  const december = await req('/api/declarations/generar', first.accessToken, { ...period, mes: 12 }, 201);
  assert.notEqual(december.id, semester.id); checks++;
  assert.equal(december.totalIvaVentas, '0'); checks++;
  await req('/api/declarations/generar', first.accessToken, { ...semesterPeriod, mes: 7 }, 400);
  await req('/api/declarations/generar', first.accessToken, { ...semesterPeriod, companyId: users[1].company.id }, 403);
  const semesterHistory = await req(`/api/declarations/history?companyId=${first.company.id}&mes=12&anio=2026&periodicidad=SEMESTRAL`, first.accessToken);
  assert.equal(semesterHistory.length, 1); checks++;
  assert.equal(semesterHistory[0].snapshot.periodicidad, 'SEMESTRAL'); checks++;
  await req('/api/declarations/presentar', first.accessToken, period, 201);
  await req('/api/declarations/generar', first.accessToken, semesterPeriod, 400);
  await req('/api/declarations/presentar', first.accessToken, semesterPeriod, 400);
  await Promise.all([1, 2].map(() => req('/api/declarations/generar', first.accessToken, period, 201)));
  const history = await req(`/api/declarations/history?companyId=${first.company.id}&mes=10&anio=2026`, first.accessToken);
  assert.deepEqual(history.map(h => h.version), [1, 2, 3, 4]); checks++;
  assert.equal(history[1].snapshot.estado, 'PRESENTADA_LOCAL'); checks++;
  assert.equal(history[2].previous.estado, 'PRESENTADA_LOCAL'); checks++;
  assert.equal(history[3].snapshot.estado, 'BORRADOR'); checks++;
  await req('/api/declarations/generar', first.accessToken, semesterPeriod, 400);
  assert.ok(history.every(h => h.actorId && h.createdAt)); checks++;
  const prepared = await req('/api/declarations/generar', first.accessToken, { ...period, ajustes: { factorCredito:'1', justificacion:'Revisión aislada del período para comprobar el cierre' } }, 201);
  const csvReport = await req(`/api/declarations/report?companyId=${first.company.id}&declarationId=${prepared.id}&version=${prepared.revision}`, first.accessToken);
  assert.ok(csvReport.content.includes('Detalle de comprobantes')); checks++;
  await req(`/api/declarations/report?companyId=${users[1].company.id}&declarationId=${prepared.id}&version=${prepared.revision}`, first.accessToken, undefined, 403);
  const transition = (accion, revision) => req('/api/declarations/workflow', first.accessToken, { ...period, accion, revision, motivo:'Comprobantes y conciliación revisados en prueba aislada' }, 201);
  const reviewed = await transition('REVISAR', prepared.revision);
  await req('/api/declarations/workflow', first.accessToken, { ...period, accion:'APROBAR', revision:prepared.revision, motivo:'Revisión con versión desactualizada' }, 409);
  const approved = await transition('APROBAR', reviewed.revision);
  const closed = await transition('CERRAR', approved.revision);
  assert.equal(closed.estado,'CERRADA'); checks++;
  await req('/api/declarations/generar', first.accessToken, period, 409);
  await req('/api/ats/operations', first.accessToken, {...operationBody,data:{...operationBody.data,secuencialInicio:'30',secuencialFin:'40'}}, 409);
  await req('/api/ats/review', first.accessToken, { ...atsReview, voucherId: sourceVoucher.id, fechaRegistro: undefined }, 409);
  await req('/api/vouchers/import', first.accessToken, { companyId: first.company.id, xmlContent: xml.replace('solo-prueba-concurrente', 'prueba-cierre') }, 409);
  const reopened = await transition('REABRIR', closed.revision);
  assert.equal(reopened.estado,'BORRADOR'); checks++;
  await req('/api/declarations/generar', first.accessToken, period, 201);
  await req('/api/auth/forgot-password', null, { email: first.email }, 503);
  const resetToken = randomBytes(32).toString('hex');
  const firstUser = await prisma.user.findUniqueOrThrow({ where: { email: first.email } });
  await prisma.passwordReset.create({ data: { userId: firstUser.id,
    tokenHash: createHash('sha256').update(resetToken).digest('hex'), expiresAt: new Date(Date.now() + 60000) } });
  const newPassword = String(require('node:crypto').randomInt(10000000, 100000000));
  const resetResponses = await Promise.all([1, 2].map(() => fetch(origin + '/api/auth/reset-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: resetToken, password: newPassword }),
  })));
  assert.deepEqual(resetResponses.map(r => r.status).sort(), [201, 400]); checks++;
  await req('/api/companies', first.accessToken, undefined, 401);
  await req('/api/auth/refresh', null, { refreshToken: first.refreshToken }, 401);
  await req('/api/auth/login', null, { email: first.email, password }, 401);
  await req('/api/auth/login', null, { email: first.email, password: newPassword }, 201);
  const expiredToken = randomBytes(32).toString('hex');
  await prisma.passwordReset.create({ data: { userId: firstUser.id,
    tokenHash: createHash('sha256').update(expiredToken).digest('hex'), expiresAt: new Date(Date.now() - 60000) } });
  await req('/api/auth/reset-password', null, { token: expiredToken, password: newPassword }, 400);
  // Restauración en otra base del mismo contenedor efímero, nunca sobre la original.
  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: users[1].email } });
  await prisma.user.update({ where: { id: adminUser.id }, data: { platformAdmin: true } });
  const adminLogin = await req('/api/auth/login', null, { ruc: users[1].company.ruc, password }, 201);
  const adminUsers = await req('/api/admin/users', adminLogin.accessToken);
  assert.equal(adminUsers.length, 2); checks++;
  assert.ok(adminUsers.every(u => !('passwordHash' in u))); checks++;
  await req(`/api/admin/users/${adminUser.id}/status`, adminLogin.accessToken, { activo: false }, 403);
  const targetLogin = await req('/api/auth/login', null, { ruc: first.company.ruc, password: newPassword }, 201);
  const roleRoute = `/api/admin/users/${firstUser.id}/admin-role`;
  await req(roleRoute, targetLogin.accessToken, { platformAdmin: true }, 403);
  await req(`/api/admin/users/${adminUser.id}/admin-role`, adminLogin.accessToken, { platformAdmin: false }, 400);
  await req(roleRoute, adminLogin.accessToken, { platformAdmin: 'true' }, 400);
  await req(roleRoute, adminLogin.accessToken, { platformAdmin: true }, 201);
  await req('/api/auth/me', targetLogin.accessToken, undefined, 401);
  await req('/api/auth/refresh', null, { refreshToken: targetLogin.refreshToken }, 401);
  const delegated = await req('/api/auth/login', null, { ruc: first.company.ruc, password: newPassword }, 201);
  await req('/api/admin/users', delegated.accessToken);
  await req(roleRoute, adminLogin.accessToken, { platformAdmin: false }, 201);
  await req('/api/admin/users', delegated.accessToken, undefined, 401);
  assert.equal(await prisma.auditLog.count({ where: { registroId: firstUser.id,
    accion: { in: ['OTORGAR_ADMINISTRADOR', 'RETIRAR_ADMINISTRADOR'] } } }), 2); checks++;
  await req(`/api/admin/users/${firstUser.id}/status`, adminLogin.accessToken, { activo: false }, 201);
  await req('/api/auth/me', targetLogin.accessToken, undefined, 401);
  await req('/api/auth/login', null, { ruc: first.company.ruc, password: newPassword }, 401);
  await req(roleRoute, adminLogin.accessToken, { platformAdmin: true }, 400);
  await req(`/api/admin/users/${firstUser.id}/status`, adminLogin.accessToken, { activo: true }, 201);
  await req('/api/auth/me', targetLogin.accessToken, undefined, 401);
  await req('/api/auth/login', null, { ruc: first.company.ruc, password: newPassword }, 201);
  await prisma.user.update({ where: { id: adminUser.id }, data: { platformAdmin: false } });
  await req('/api/admin/users', adminLogin.accessToken, undefined, 403);
  docker(['exec', name, 'pg_dump', '-U', 'postgres', '-d', 'dayanex_test', '-Fc', '-f', '/tmp/dayanex.dump']);
  // Una cuenta antigua conserva sus datos, pero debe completar su identificación.
  await prisma.user.update({ where: { id: firstUser.id }, data: { ruc: null } });
  const legacy = await req('/api/auth/login', null, { email: first.email, password: newPassword }, 201);
  const legacyProfile = await req('/api/auth/me', legacy.accessToken);
  assert.equal(legacyProfile.ruc, null); checks++;
  await req('/api/companies', legacy.accessToken, undefined, 403);
  await req('/api/auth/identity', legacy.accessToken, { ruc: '123' }, 400);
  await req('/api/auth/identity', legacy.accessToken, { ruc: users[1].company.ruc }, 409);
  await req('/api/auth/identity', legacy.accessToken, { ruc: '0999999990' }, 201);
  await req('/api/auth/identity', legacy.accessToken, { ruc: '0999999991' }, 409);
  const identified = await req('/api/auth/login', null, { ruc: '0999999990', password: newPassword }, 201);
  const retainedCompanies = await req('/api/companies', identified.accessToken);
  assert.equal(retainedCompanies[0].id, first.company.id); checks++;
  docker(['exec', name, 'createdb', '-U', 'postgres', 'dayanex_restore']);
  docker(['exec', name, 'pg_restore', '-U', 'postgres', '-d', 'dayanex_restore', '/tmp/dayanex.dump']);
  const restored = docker(['exec', name, 'psql', '-U', 'postgres', '-d', 'dayanex_restore', '-Atc',
    'SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM companies), (SELECT count(*) FROM vouchers), (SELECT count(*) FROM tax_declarations)']);
  assert.equal(restored, '2|2|1|4'); checks++;
  // Repite el ciclo con las herramientas reales de cifrado y restauración aislada.
  const dumpPath = path.join(migrationTemp, 'integration.dump');
  const encryptedPath = path.join(migrationTemp, 'integration.enc');
  docker(['cp', `${name}:/tmp/dayanex.dump`, dumpPath]);
  const backupKey = randomBytes(32).toString('hex');
  await require('./encrypt-backup.cjs').encryptBackup(fs.createReadStream(dumpPath), encryptedPath, backupKey);
  fs.unlinkSync(dumpPath);
  const recovery = await require('./verify-backup.cjs').verifyBackup(encryptedPath, backupKey);
  assert.deepEqual(recovery, { restored: true, users: 2, companies: 2, declarations: 4, pendingMigrations: 0 }); checks++;
  const decisionVoucher = await prisma.voucher.create({ data: { ...sourceVoucher, id: randomUUID(), claveAcceso: randomUUID(),
    direccion: 'COMPRA', fechaEmision: new Date('2025-10-10Z'), fechaRegistroAts: new Date('2025-11-01Z') } });
  const decisionPath = `/api/declarations/period-decisions?companyId=${first.company.id}&voucherId=${decisionVoucher.id}`;
  const decisionSource = await req(decisionPath, identified.accessToken);
  await req(decisionPath, users[1].accessToken, undefined, 403);
  const proposal = { companyId: first.company.id, voucherId: decisionVoucher.id, previousVersion: 0,
    sourceHash: decisionSource.sourceHash, choice: 'REGISTRO', justification: 'Propuesta documentada en ensayo aislado', evidence: 'Libro de compras noviembre 2025' };
  await req('/api/declarations/period-decisions', identified.accessToken, { ...proposal, evidence: ' ' }, 400);
  const savedDecision = await req('/api/declarations/period-decisions', identified.accessToken, proposal, 201);
  assert.equal(savedDecision.decision.proposedPeriod, '2025-11'); checks++;
  assert.equal(savedDecision.changesTaxCalculation, false); checks++;
  await req('/api/declarations/period-decisions', identified.accessToken, proposal, 409);
  await req('/api/declarations/period-decisions', identified.accessToken, { ...proposal, previousVersion: 1, choice: 'PENDIENTE' }, 201);
  const decisionHistory = await req(decisionPath, identified.accessToken);
  assert.equal(decisionHistory.history.length, 2); checks++;
  await assert.rejects(prisma.periodDecision.update({ where: { id: savedDecision.decision.id }, data: { justification: 'Alteración prohibida' } })); checks++;
  await assert.rejects(prisma.periodDecision.delete({ where: { id: savedDecision.decision.id } })); checks++;
  await prisma.voucher.update({ where: { id: decisionVoucher.id }, data: { atsRevision: { cambio: 'ensayo' } } });
  assert.equal((await req(decisionPath, identified.accessToken)).stale, true); checks++;
  await req('/api/declarations/period-decisions', identified.accessToken, { ...proposal, previousVersion: 2 }, 409);
  const refreshed = await req(decisionPath, identified.accessToken);
  await prisma.taxDeclaration.create({ data: { companyId: first.company.id, mes: 11, anio: 2025, periodicidad: 'MENSUAL', estado: 'CERRADA' } });
  await req('/api/declarations/period-decisions', identified.accessToken, { ...proposal, previousVersion: 2, sourceHash: refreshed.sourceHash }, 409);
  const txtKey = '0101202401179001234500120010010000000011234567811';
  const txtContent = `CLAVE_ACCESO;RUC_EMISOR;FECHA_EMISION;TIPO_COMPROBANTE;TARIFA_IVA;BASE_IMPONIBLE;IVA\n${txtKey};1790012345001;01/01/2024;FACTURA;15;100,00;15,00`;
  const txtBody = { companyId: first.company.id, sentido: 'RECIBIDOS', txtContent };
  await req('/api/vouchers/import-txt', users[1].accessToken, txtBody, 403);
  const importedTxt = await req('/api/vouchers/import-txt', identified.accessToken, txtBody, 201);
  assert.equal(importedTxt.importados, 1); checks++;
  const duplicateTxt = await req('/api/vouchers/import-txt', identified.accessToken, txtBody, 201);
  assert.equal(duplicateTxt.duplicados, 1); checks++;
  const pendingKey = txtKey.slice(0, -1) + '2';
  await req('/api/vouchers/import-txt', identified.accessToken, { ...txtBody,
    txtContent: `CLAVE_ACCESO;RUC_EMISOR;FECHA_EMISION;TIPO_COMPROBANTE;IMPORTE_TOTAL\n${pendingKey};1790012345001;01/01/2024;FACTURA;108,00` }, 201);
  await req('/api/declarations/generar', identified.accessToken, {companyId:first.company.id,mes:1,anio:2024}, 400);
  const pendingBefore = await prisma.voucher.findUniqueOrThrow({where:{companyId_claveAcceso:{companyId:first.company.id,claveAcceso:pendingKey}}});
  const completed = await req('/api/vouchers/import', identified.accessToken, {companyId:first.company.id,
    xmlContent:`<factura><infoTributaria><ruc>1790012345001</ruc><claveAcceso>${pendingKey}</claveAcceso></infoTributaria><infoFactura><fechaEmision>01/01/2024</fechaEmision><identificacionComprador>${first.company.ruc}</identificacionComprador><importeTotal>108.00</importeTotal><totalConImpuestos><totalImpuesto><codigo>2</codigo><codigoPorcentaje>8</codigoPorcentaje><baseImponible>100.00</baseImponible><valor>8.00</valor></totalImpuesto></totalConImpuestos></infoFactura></factura>`},201);
  assert.equal(completed.voucher.id,pendingBefore.id); checks++;
  assert.equal(completed.voucher.clasificacionPendiente,false); checks++;
  const taxResult = await req('/api/declarations/generar', identified.accessToken, {companyId:first.company.id,mes:1,anio:2024}, 201);
  assert.equal(Number(taxResult.totalIvaCompras),23); checks++;
  assert.equal(taxResult.liquidacion.desgloseTarifas.find(v=>v.tarifa==='15').base,100); checks++;
  assert.equal(taxResult.liquidacion.desgloseTarifas.find(v=>v.tarifa==='8').valor,8); checks++;
  // Exercise the destructive feature only against this disposable database.
  {
  const companyPath = `/api/companies/${first.company.id}`;
  const companyPdf = Buffer.from('%PDF-1.7\nrespaldo empresa').toString('base64');
  await req('/api/declarations/filings', identified.accessToken, {
    companyId: first.company.id, declarationId: taxResult.id, revision: taxResult.revision,
    formulario: '104', tipo: 'PRESENTACION', numero: 'RESPALDO-EMPRESA', fecha: '2026-01-01T00:00:00.000Z',
    valor: '0.00', observacion: 'Adjunto de prueba para exportación completa', archivoBase64: companyPdf,
  }, 201);
  await req(`${companyPath}/editar`, users[1].accessToken, { ...first.company, razonSocial: 'Ajena' }, 403);
  const edit = { ruc: first.company.ruc, razonSocial: 'Empresa editada', regimen: 'GENERAL', nombreComercial: '', actividadEconomica: '', direccion: 'Dirección de ensayo', telefono: '0991234567' };
  await req(`${companyPath}/editar`, identified.accessToken, { ...edit, razonSocial: '   ' }, 400);
  await req(`${companyPath}/editar`, identified.accessToken, { ...edit, ruc: '0991234567001' }, 409);
  const edited = await req(`${companyPath}/editar`, identified.accessToken, edit, 201);
  assert.equal(edited.razonSocial, edit.razonSocial); checks++;
  assert.equal(edited.direccion, edit.direccion); checks++;
  await req(`${companyPath}/respaldo`, users[1].accessToken, undefined, 403);
  const backup = await req(`${companyPath}/respaldo`, identified.accessToken);
  const saved = JSON.parse(require('node:zlib').gunzipSync(Buffer.from(backup.contentBase64, 'base64')).toString('utf8'));
  assert.equal(saved.empresa.id, first.company.id); checks++;
  assert.ok(saved.empresa.vouchers.some(v => v.xmlOriginal)); checks++;
  assert.ok(saved.empresa.declarations.some(d => d.revisions.length)); checks++;
  assert.ok(saved.empresa.declarations.some(d => d.filings.some(f => f.archivoPdfBase64 === companyPdf))); checks++;
  assert.equal(saved.decisionesPeriodo.length, 2); checks++;
  assert.ok(!JSON.stringify(saved).includes('passwordHash')); checks++;
  assert.ok(!JSON.stringify(saved).includes('archivoCifrado')); checks++;
  await req(`${companyPath}/eliminar`, users[1].accessToken, { confirmarRuc: first.company.ruc }, 403);
  await req(`${companyPath}/eliminar`, identified.accessToken, { confirmarRuc: '0991234567001' }, 409);
  assert.ok(await prisma.company.findUnique({ where: { id: first.company.id } })); checks++;
  await req(`${companyPath}/eliminar`, identified.accessToken, { confirmarRuc: first.company.ruc }, 201);
  assert.equal(await prisma.company.findUnique({ where: { id: first.company.id } }), null); checks++;
  for (const model of ['voucher', 'taxDeclaration', 'periodDecision', 'atsOperation', 'auditLog', 'companyUser']) {
    assert.equal(await prisma[model].count({ where: { companyId: first.company.id } }), 0); checks++;
  }
  assert.ok(await prisma.company.findUnique({ where: { id: users[1].company.id } })); checks++;
  assert.equal(await prisma.auditLog.count({ where: { accion: 'ELIMINAR_EMPRESA', registroId: first.company.id } }), 1); checks++;
  await req(`${companyPath}/respaldo`, identified.accessToken, undefined, 403);
  }
  // Identical RUCs belong to separate account records, never implicitly shared.
  {
    const sharedRuc = '0995555555001';
    const dto = { ruc: sharedRuc, razonSocial: 'Cuenta A independiente', regimen: 'GENERAL' };
    const a = await req('/api/companies', identified.accessToken, dto, 201);
    const b = await req('/api/companies', users[1].accessToken, { ...dto, razonSocial: 'Cuenta B independiente' }, 201);
    assert.notEqual(a.id, b.id); checks++;
    assert.notEqual(a.ownerUserId, b.ownerUserId); checks++;
    await req('/api/companies', identified.accessToken, dto, 409);
    await req('/api/companies', users[1].accessToken, dto, 409);
    await req('/api/companies', identified.accessToken, { ...dto, ruc: '0995555554001', ownerUserId: b.ownerUserId }, 400);
    for (const [own, foreign, token] of [[a,b,identified.accessToken], [b,a,users[1].accessToken]]) {
      const list = await req('/api/companies', token);
      assert.deepEqual(list.filter(c => c.ruc === sharedRuc).map(c => c.id), [own.id]); checks++;
      for (const path of [`/api/vouchers?companyId=${foreign.id}`, `/api/companies/${foreign.id}/respaldo`, `/api/declarations/history?companyId=${foreign.id}&mes=10&anio=2026`]) {
        await req(path, token, undefined, 403);
      }
      await req(`/api/companies/${foreign.id}/editar`, token, dto, 403);
      await req(`/api/companies/${foreign.id}/eliminar`, token, { confirmarRuc: sharedRuc }, 403);
    }
    const pendingTxt = `CLAVE_ACCESO\tRUC_EMISOR\tIDENTIFICACION_RECEPTOR\tFECHA_EMISION\tTIPO_COMPROBANTE\tIMPORTE_TOTAL\n${txtKey}\t1790012345001\t${sharedRuc}\t01/01/2024\tFACTURA\t115.00`;
    for (const [company,token] of [[a,identified.accessToken],[b,users[1].accessToken]]) {
      await req('/api/vouchers/import-txt', token, {companyId:company.id,txtContent:pendingTxt,sentido:'RECIBIDOS'}, 201);
      const ownVouchers = await req(`/api/vouchers?companyId=${company.id}`, token);
      assert.equal(ownVouchers.length, 1); checks++;
      assert.equal(ownVouchers[0].companyId, company.id); checks++;
    }
    const draftA = await prisma.taxDeclaration.create({ data: { companyId: a.id, mes: 10, anio: 2026, totalIvaCompras: 15 } });
    const draftB = await prisma.taxDeclaration.create({ data: { companyId: b.id, mes: 10, anio: 2026, totalIvaCompras: 30 } });
    await req(`/api/companies/${a.id}/editar`, identified.accessToken, { ...dto, razonSocial: 'Solo cambia A' }, 201);
    assert.equal((await prisma.company.findUniqueOrThrow({where:{id:b.id}})).razonSocial, 'Cuenta B independiente'); checks++;
    const backupA = await req(`/api/companies/${a.id}/respaldo`, identified.accessToken);
    const dataA = JSON.parse(require('node:zlib').gunzipSync(Buffer.from(backupA.contentBase64,'base64')).toString());
    assert.deepEqual(dataA.empresa.vouchers.map(v => v.companyId), [a.id]); checks++;
    assert.deepEqual(dataA.empresa.declarations.map(d => d.id), [draftA.id]); checks++;
    await req(`/api/companies/${a.id}/eliminar`, identified.accessToken, {confirmarRuc:sharedRuc}, 201);
    assert.equal(await prisma.voucher.count({where:{companyId:b.id}}),1); checks++;
    assert.ok(await prisma.taxDeclaration.findUnique({where:{id:draftB.id}})); checks++;
    // Editing and simultaneous creation are still unique within one account.
    const editable = await req('/api/companies', identified.accessToken, { ...dto, ruc:'0995555553001' }, 201);
    await req(`/api/companies/${editable.id}/editar`, identified.accessToken, dto, 201);
    const concurrentDto = {...dto, ruc:'0995555552001'};
    const responses = await Promise.all([0,1].map(() => fetch(origin+'/api/companies', {
      method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${identified.accessToken}`}, body:JSON.stringify(concurrentDto),
    })));
    assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]); checks++;
    await req(`/api/companies/${editable.id}/editar`, identified.accessToken, concurrentDto, 409);
    await req(`/api/companies/${b.id}/eliminar`, users[1].accessToken, {confirmarRuc:sharedRuc}, 201);
    await req(`/api/companies/${editable.id}/eliminar`, identified.accessToken, {confirmarRuc:sharedRuc}, 201);
  }
  console.log(JSON.stringify({ result: 'PASS', checks, database: 'PostgreSQL 16 aislado', users: 2, companies: 2,
    scope: 'HTTP real: permisos, registros, login, refresh, logout; sin llamadas SRI ni producción' }));
}
main().catch(error => { console.error(error.message.replaceAll(password, '[redacted]')); process.exitCode = 1; })
  .finally(async () => {
    fs.rmSync(migrationTemp, { recursive: true, force: true });
    if (prisma) await prisma.$disconnect();
    if (server && server.exitCode === null) {
      server.kill();
      await Promise.race([new Promise(resolve => server.once('exit', resolve)), pause(5000)]);
    }
    if (created) docker(['rm', '--force', name]);
  });
