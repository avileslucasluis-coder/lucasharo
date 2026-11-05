// Verificación de solo lectura. No inicia sesión ni crea datos de prueba.
async function checkDeployment(value) {
  const base = new URL(value);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('Usa el origen HTTPS de la aplicación.');
  const routes = ['/', '/api/health', '/recover.html', '/manifest.json'];
  for (const route of routes) {
    const response = await fetch(new URL(route, base), { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${route}: HTTP ${response.status}`);
    if (response.headers.get('x-content-type-options') !== 'nosniff') throw new Error(`${route}: falta nosniff`);
    if (!response.headers.get('content-security-policy')) throw new Error(`${route}: falta CSP`);
    if (route === '/api/health') {
      const body = await response.json();
      if (body.status !== 'ok' || body.database !== 'connected') throw new Error('Base de datos no disponible.');
      if (!response.headers.get('cache-control')?.includes('no-store')) throw new Error('La API no debe almacenarse en caché.');
    } else if (route === '/manifest.json') {
      const manifest = await response.json();
      if (manifest.name !== 'Sistema Tributario' || manifest.display !== 'standalone') throw new Error('Manifest de instalación inválido.');
    } else if (!(await response.text()).includes('<html')) throw new Error(`${route}: no contiene la interfaz HTML`);
  }
  const protectedResponse = await fetch(new URL('/api/companies', base), { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (protectedResponse.status !== 401) throw new Error('El acceso sin sesión no fue rechazado.');
  return { healthy: true, checks: routes.length + 1 };
}
module.exports = { checkDeployment };
if (require.main === module) checkDeployment(process.env.DEPLOYMENT_URL)
  .then(result => console.log(JSON.stringify(result)))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
