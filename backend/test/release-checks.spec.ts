const { preflight } = require('../scripts/preflight-production.cjs');
const { checkDeployment } = require('../scripts/check-deployment.cjs');
describe('Comprobaciones de publicación', () => {
  it('no revela secretos al rechazar una configuración incompleta', () => {
    const result = preflight({ JWT_SECRET: 'valor-privado', GMAIL_APP_PASSWORD: 'otra-clave' });
    expect(result.ready).toBe(false);
    expect(JSON.stringify(result)).not.toContain('valor-privado');
    expect(JSON.stringify(result)).not.toContain('otra-clave');
  });
  it('acepta configuración explícita y rechaza recuperación en otro dominio', () => {
    const env = { JWT_SECRET: 'a'.repeat(64), DATA_ENCRYPTION_KEY: 'b'.repeat(64), ALLOW_PUBLIC_REGISTRATION: 'true',
      CORS_ORIGIN: 'https://app.example.com', DATABASE_URL: 'postgresql://u:p@db.example.com/db?sslmode=require&sslaccept=strict',
      MAIL_PROVIDER: 'gmail', GMAIL_USER: 'example@gmail.com', GMAIL_APP_PASSWORD: 'abcdefghijklmnop', PASSWORD_RESET_URL: 'https://app.example.com/recover.html' };
    expect(preflight(env).ready).toBe(true);
    expect(preflight({ ...env, PASSWORD_RESET_URL: 'https://other.example.com/recover.html' }).ready).toBe(false);
  });
  it('rechaza un monitor HTTP antes de hacer peticiones', async () => {
    await expect(checkDeployment('http://example.com')).rejects.toThrow('HTTPS');
  });
  it('verifica salud e instalación y detecta un endpoint privado abierto', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    let privateStatus = 401;
    fetchMock.mockImplementation(async (url) => {
      const route = new URL(String(url)).pathname;
      return new Response(route === '/api/health' ? JSON.stringify({ status:'ok', database:'connected' }) : route === '/manifest.json' ? JSON.stringify({ name:'Sistema Tributario', display:'standalone' }) : '<html></html>', {
        status: route === '/api/companies' ? privateStatus : 200,
        headers: { 'x-content-type-options':'nosniff', 'content-security-policy':"default-src 'self'", 'cache-control':'no-store' },
      });
    });
    try {
      expect(await checkDeployment('https://app.example.com')).toEqual({ healthy:true, checks:5 });
      privateStatus = 200;
      await expect(checkDeployment('https://app.example.com')).rejects.toThrow('sin sesión');
    } finally { fetchMock.mockRestore(); }
  });
});
