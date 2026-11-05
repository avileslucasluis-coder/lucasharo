import { jwtSecret, validateProduction } from '../src/security/config';
import { redactAudit } from '../src/audit/audit.service';
import { AuthRateGuard } from '../src/security/auth-rate.guard';
import { AuthService } from '../src/auth/auth.service';

describe('Controles de seguridad', () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; });
  it('rechaza secretos ausentes o de ejemplo', () => {
    expect(() => jwtSecret()).toThrow();
    expect(() => jwtSecret('CAMBIAR'.repeat(10))).toThrow();
    expect(jwtSecret('a'.repeat(64))).toHaveLength(64);
  });
  it('exige origen HTTPS y TLS de base de datos en producción', () => {
    const env = { NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(64), CORS_ORIGIN: 'https://app.example.com', DATABASE_URL: 'postgresql://u:p@db.example.com/db?sslmode=require&sslaccept=strict' };
    expect(() => validateProduction(env)).not.toThrow();
    expect(() => validateProduction({ ...env, CORS_ORIGIN: '*' })).toThrow();
    expect(() => validateProduction({ ...env, DATABASE_URL: 'postgresql://u:p@db/db' })).toThrow();
    expect(() => validateProduction({ ...env, DATABASE_URL: env.DATABASE_URL.replace('strict', 'accept_invalid_certs') })).toThrow();
  });
  it('redacta secretos anidados y XML de auditoría', () => {
    expect(redactAudit({ estado: 'OK', detalle: [{ password: 'secreto', xmlFirmado: '<xml/>' }], refreshToken: 'token' }))
      .toEqual({ estado: 'OK', detalle: [{ password: '[REDACTADO]', xmlFirmado: '[REDACTADO]' }], refreshToken: '[REDACTADO]' });
  });
  it('bloquea intentos excesivos y no pasa correos/IP en claro al contador', async () => {
    process.env.JWT_SECRET = 'a'.repeat(64);
    const query = jest.fn().mockResolvedValue([{ attempts: 101, expires_at: new Date(Date.now() + 60000) }]);
    const headers = jest.fn();
    const guard = new AuthRateGuard({ $queryRaw: query } as any);
    const context = { getHandler: () => ({ name: 'login' }), switchToHttp: () => ({ getRequest: () => ({ ip: '1.2.3.4', body: { email: 'persona@example.com' } }), getResponse: () => ({ setHeader: headers }) }) } as any;
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 429 });
    expect(headers).toHaveBeenCalledWith('Retry-After', expect.any(Number));
    expect(query.mock.calls[0][1]).toMatch(/^[a-f0-9]{64}$/);
  });
  it('permite solo una renovación cuando dos peticiones usan el mismo token', async () => {
    let consumed = false;
    const prisma = {
      refreshToken: {
        findFirst: jest.fn().mockResolvedValue({ id: 'token', userId: 'user' }),
        updateMany: jest.fn(async () => { if (consumed) return { count: 0 }; consumed = true; return { count: 1 }; }),
        create: jest.fn(),
      },
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'user', email: 'a@example.com', activo: true }) },
    };
    const jwt = { signAsync: jest.fn().mockResolvedValue('jwt') };
    const auth = new AuthService(prisma as any, jwt as any, { registrar: jest.fn() } as any);
    const results = await Promise.allSettled([auth.refresh('same'), auth.refresh('same')]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(jwt.signAsync).toHaveBeenCalledTimes(1);
  });
  it('no renueva sesiones de usuarios desactivados', async () => {
    const prisma = { refreshToken: { findFirst: jest.fn().mockResolvedValue({ id: 't', userId: 'u' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ activo: false }) } };
    const jwt = { signAsync: jest.fn() };
    const auth = new AuthService(prisma as any, jwt as any, {} as any);
    await expect(auth.refresh('token')).rejects.toThrow('Sesión inválida');
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
  it('cierra el registro público en producción por defecto', async () => {
    process.env.NODE_ENV = 'production'; delete process.env.ALLOW_PUBLIC_REGISTRATION;
    await expect(new AuthService({} as any, {} as any, {} as any).register({ ruc: '0999999999001', email: 'a@example.com', password: 'segura-larga-123', nombre: 'Prueba' })).rejects.toThrow('deshabilitado');
  });
});
