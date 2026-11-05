// Prepara exclusivamente una base nueva para esta copia; no utiliza bases del ZIP.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const statePath = path.join(root, '.local-database.json');
const docker = args => execFileSync('docker', args, {encoding:'utf8',timeout:120000,windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
async function main() {
  if (fs.existsSync(envPath) || fs.existsSync(statePath)) throw new Error('Ya existe configuración local. No se sobrescribe; usa npm run start:prod.');
  const id = randomUUID().slice(0,8), name = `dayanex-declaraciones-${id}`, volume = `${name}-data`;
  const password = randomBytes(32).toString('hex');
  docker(['run','-d','--name',name,'--restart','unless-stopped','-p','127.0.0.1::5432','-v',`${volume}:/var/lib/postgresql/data`,
    '-e',`POSTGRES_PASSWORD=${password}`,'-e','POSTGRES_DB=declaraciones','postgres:16-alpine']);
  const dbPort = docker(['port',name,'5432/tcp']).split(':').pop();
  fs.writeFileSync(statePath,JSON.stringify({name,volume,dbPort},null,2));
  fs.writeFileSync(envPath,`DATABASE_URL=postgresql://postgres:${password}@127.0.0.1:${dbPort}/declaraciones\nJWT_SECRET=${randomBytes(48).toString('hex')}\nPORT=8092\nCORS_ORIGIN=http://localhost:8092,http://127.0.0.1:8092\nNODE_ENV=development\nMAIL_PROVIDER=gmail\nGMAIL_USER=avileslucasluis@gmail.com\nGMAIL_APP_PASSWORD=\nPASSWORD_RESET_URL=https://TU-DOMINIO/recover.html\nDATA_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\n`);
  for(let i=0;i<40;i++) {
    try {docker(['exec',name,'pg_isready','-U','postgres']);break;}
    catch {if(i===39) throw new Error('PostgreSQL no inició. La configuración se conservó.'); await new Promise(r=>setTimeout(r,500));}
  }
  execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{cwd:root,stdio:'inherit',windowsHide:true});
  execFileSync(process.execPath,['--env-file=.env','node_modules/ts-node/dist/bin.js','prisma/seed.ts'],{cwd:root,stdio:'inherit',windowsHide:true});
  console.log('Base local creada y migrada. Inicia con npm run start:prod y abre http://localhost:8092.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
