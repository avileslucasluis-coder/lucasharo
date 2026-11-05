import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { RecoveryMailService } from './recovery-mail.service';

const generic = { message: 'Si la cuenta está activa, recibirás instrucciones para recuperar tu acceso.' };
@Injectable()
export class PasswordRecoveryService {
  constructor(private readonly prisma: PrismaService, private readonly mail: RecoveryMailService) {}

  async request(email: string) {
    this.mail.checkConfiguration();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.activo || !user.email) return generic;
    const token = randomBytes(32).toString('hex');
    const record = await this.prisma.passwordReset.create({ data: {
      userId: user.id, tokenHash: this.hash(token), expiresAt: new Date(Date.now() + 15 * 60000),
    } });
    try { await this.mail.send(user.email, token); }
    catch {
      await this.prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } });
      // Mismo resultado para cuentas existentes y ausentes; el proveedor registra el fallo sin exponer el token.
    }
    return generic;
  }

  async reset(token: string, password: string) {
    const tokenHash = this.hash(token);
    const record = await this.prisma.passwordReset.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt <= new Date()) throw new BadRequestException('Enlace inválido o caducado.');
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await this.prisma.$transaction(async tx => {
      // Bloquea al usuario para que dos enlaces de recuperación no cambien la contraseña simultáneamente.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${record.userId}))`;
      const consumed = await tx.passwordReset.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() }, user: { activo: true } },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) throw new BadRequestException('Enlace inválido o caducado.');
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash, sessionVersion: { increment: 1 } } });
      await tx.refreshToken.updateMany({ where: { userId: record.userId }, data: { revocado: true } });
      await tx.passwordReset.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: new Date() } });
      await tx.auditLog.create({ data: { userId: record.userId, accion: 'RESTABLECER_PASSWORD', modulo: 'AUTH', resultado: 'OK' } });
    });
    return { message: 'Contraseña actualizada. Inicia sesión de nuevo.' };
  }

  private hash(token: string) { return createHash('sha256').update(token).digest('hex'); }
}
