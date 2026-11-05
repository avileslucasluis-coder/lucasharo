// Transfiere a un destino Neon vacío; nunca limpia ni reemplaza tablas remotas.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {Readable}=require('node:stream');
const dotenv=require('dotenv');
const {PrismaClient}=require('@prisma/client');
const {connection,inspect}=require('./neon-connection.cjs');
const {encryptBackup}=require('./encrypt-backup.cjs');
const {checkDatabase}=require('./check-database.cjs');
const root=path.resolve(__dirname,'..');
let stage='validación';
async function main() {
  const target=connection(), u=new URL(target);
  const envFile=path.join(root,'.env'), original=fs.readFileSync(envFile,'utf8'), local=dotenv.parse(original);
  const source=new URL(local.DATABASE_URL);
  if(!['127.0.0.1','localhost'].includes(source.hostname)) throw new Error();
  const state=JSON.parse(fs.readFileSync(path.join(root,'.local-database.json'),'utf8'));
  if(!/^dayanex-declaraciones-[a-f0-9]{8}$/.test(state.name)) throw new Error();
  const before=await inspect(source.toString());
  const remote=await inspect(target);
  if(remote.tables.length) {console.error('Neon ya contiene tablas. Se detuvo la transferencia sin reemplazarlas.');process.exitCode=1;return;}
  try {const r=await fetch('http://127.0.0.1:8092/api/health',{signal:AbortSignal.timeout(1500)});if(r.ok) {console.error('Detén el servidor local antes de transferir para evitar escrituras durante el cambio.');process.exitCode=1;return;}}catch{}
  const run=(args, options={})=>execFileSync('docker',args,{windowsHide:true,timeout:120000,maxBuffer:64*1024*1024,stdio:['pipe','pipe','pipe'],...options});
  stage='verificación TLS de Neon';
  const pgEnv={...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:decodeURIComponent(u.pathname.slice(1)),PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGSSLMODE:'verify-full',PGSSLROOTCERT:'system',PGCONNECT_TIMEOUT:'30'};
  const flags=['PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSSLMODE','PGSSLROOTCERT','PGCONNECT_TIMEOUT'].flatMap(k=>['-e',k]);
  run(['exec',...flags,state.name,'psql','-X','-v','ON_ERROR_STOP=1','-Atc','SELECT 1'],{env:pgEnv});
  stage='copia local cifrada';
  const dump=run(['exec',state.name,'pg_dump','-U',decodeURIComponent(source.username),'-d',decodeURIComponent(source.pathname.slice(1)),'--format=custom','--no-owner','--no-acl']);
  const backupDir=path.join(root,'.cache');fs.mkdirSync(backupDir,{recursive:true});
  const backup=path.join(backupDir,`antes-neon-${Date.now()}.enc`);
  await encryptBackup(Readable.from(dump),backup,local.DATA_ENCRYPTION_KEY);
  stage='restauración atómica en Neon';
  run(['exec','-i',...flags,state.name,'pg_restore','--dbname',decodeURIComponent(u.pathname.slice(1)),'--no-owner','--no-acl','--exit-on-error','--single-transaction'],{input:dump,env:pgEnv});
  stage='verificación del esquema y registros';
  const after=await inspect(target);
  if(JSON.stringify(before.tables)!==JSON.stringify(after.tables)||JSON.stringify(before.counts)!==JSON.stringify(after.counts)) throw new Error();
  const db=new PrismaClient({datasources:{db:{url:target}},log:[]});
  try {const check=await checkDatabase(db);if(!check.ready)throw new Error();}finally{await db.$disconnect();}
  stage='activación de conexión';
  const previous=path.join(root,'.env.before-neon');
  if(!fs.existsSync(previous)) fs.writeFileSync(previous,original,{flag:'wx',mode:0o600});
  const updated=original.replace(/^DATABASE_URL=.*$/m,()=>`DATABASE_URL="${target}"`);
  fs.writeFileSync(envFile,updated,{mode:0o600});
  console.log(JSON.stringify({connected:'Neon',schemaVerified:true,counts:after.counts,localDatabasePreserved:true,encryptedBackup:path.basename(backup)}));
}
main().catch(()=>{console.error(`No se completó la etapa: ${stage}. No se muestran credenciales; conserva la base local para recuperación.`);process.exitCode=1;});
