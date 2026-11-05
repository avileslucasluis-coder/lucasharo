import { createHash } from 'crypto';
import { PasswordRecoveryService } from '../src/auth/password-recovery.service';
import { RecoveryMailService } from '../src/auth/recovery-mail.service';

describe('Recuperación de contraseña', () => {
  it('almacena solo el hash y no expone el token en la respuesta', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'r' });
    const mail = { checkConfiguration: jest.fn(), send: jest.fn() };
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u', email: 'u@example.com', activo: true }) }, passwordReset: { create } };
    const service = new PasswordRecoveryService(prisma as any, mail as any);
    const answer = await service.request('u@example.com');
    const token = mail.send.mock.calls[0][1];
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(create.mock.calls[0][0].data.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(answer)).not.toContain(token);
    prisma.user.findUnique.mockResolvedValue(null);
    expect(await service.request('missing@example.com')).toEqual(answer);
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it('invalida el enlace si el envío falla sin revelar que la cuenta existe', async () => {
    const update = jest.fn();
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u', email: 'u@example.com', activo: true }) },
      passwordReset: { create: jest.fn().mockResolvedValue({ id: 'r' }), update } };
    const service = new PasswordRecoveryService(prisma as any, { checkConfiguration() {}, send: jest.fn().mockRejectedValue(new Error()) } as any);
    await expect(service.request('u@example.com')).resolves.toHaveProperty('message');
    expect(update).toHaveBeenCalledWith({ where: { id: 'r' }, data: { usedAt: expect.any(Date) } });
  });

  it('no habilita envío sin configuración explícita', () => {
    const original = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try { expect(() => new RecoveryMailService().checkConfiguration()).toThrow('no está configurada'); }
    finally { if (original !== undefined) process.env.RESEND_API_KEY = original; }
  });
});
