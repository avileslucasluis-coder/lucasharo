const fs = require('node:fs');
const {execFileSync,spawn} = require('node:child_process');
async function main() {
  try { const response=await fetch('http://127.0.0.1:8092/api/health',{signal:AbortSignal.timeout(1500)});
    if(response.ok) {console.log('El sistema está listo: http://localhost:8092');return;} } catch {}
  if(!fs.existsSync('.env')) throw new Error('Falta configurar la conexión del sistema.');
  const settings=require('dotenv').parse(fs.readFileSync('.env','utf8'));
  const database=new URL(settings.DATABASE_URL);
  if(['127.0.0.1','localhost'].includes(database.hostname)) {
  if(!fs.existsSync('.local-database.json')) throw new Error('Falta la configuración de PostgreSQL local.');
  const {name}=JSON.parse(fs.readFileSync('.local-database.json','utf8'));
  if(!/^dayanex-declaraciones-[a-f0-9]{8}$/.test(name)) throw new Error('Identificador de base local inválido.');
  execFileSync('docker',['start',name],{stdio:'inherit',windowsHide:true});
  const dbPort=execFileSync('docker',['port',name,'5432/tcp'],{encoding:'utf8',windowsHide:true}).trim().split(':').pop();
  if(!/^\d+$/.test(dbPort)) throw new Error('No se pudo determinar el puerto de PostgreSQL.');
  const env=fs.readFileSync('.env','utf8').replace(/(^DATABASE_URL=.*@127\.0\.0\.1:)\d+/m,(_match,prefix)=>prefix+dbPort);
  fs.writeFileSync('.env',env);
  const state=JSON.parse(fs.readFileSync('.local-database.json','utf8'));
  fs.writeFileSync('.local-database.json',JSON.stringify({...state,dbPort},null,2));
  }
  const server=spawn(process.execPath,['--env-file=.env','dist/main.js'],{stdio:'inherit',windowsHide:true});
  server.on('exit',code=>{process.exitCode=code??1;});
  console.log('Abre http://localhost:8092. Mantén esta ventana abierta.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
