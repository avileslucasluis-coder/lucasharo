import { Injectable, UnauthorizedException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';

/// Duración del access token (corta, para limitar el daño si se filtra) y
/// del refresh token (más largo, pero rotado y revocable en cada uso).
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DIAS = 30;

@Injectable()
export class AuthService {
  async completeIdentity(userId: string, identity: string) {
    try {
      return await this.prisma.$transaction(async tx => {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user?.activo || /^(?:[0-9]{10}|[0-9]{13})$/.test(user.ruc ?? ''))
          throw new ConflictException('La cuenta ya tiene una identificación o no está activa.');
        const changed = await tx.user.updateMany({
          where: { id: userId, activo: true, ruc: user.ruc }, data: { ruc: identity },
        });
        if (changed.count !== 1) throw new ConflictException('La cuenta ya tiene una identificación.');
        await this.audit.registrar({ userId, accion: 'COMPLETAR_IDENTIFICACION', modulo: 'AUTH', resultado: 'OK' }, tx);
        return { ruc: identity };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Ya existe una cuenta con esa cédula o RUC.');
      throw error;
    }
  }
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async register(dto: RegisterDto) {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PUBLIC_REGISTRATION !== 'true') {
      throw new ForbiddenException('El registro público está deshabilitado. Contacta al administrador.');
    }
    const existente = dto.email ? await this.prisma.user.findUnique({ where: { email: dto.email } }) : null;
    if (existente) {
      throw new ConflictException('Ya existe una cuenta con ese correo.');
    }

    // Argon2id: recomendado sobre bcrypt para hashing de contraseñas nuevas.
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    const user = await this.prisma.user.create({
      data: { ruc: dto.ruc, email: dto.email, passwordHash, nombre: dto.nombre },
    }).catch(error => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Ya existe una cuenta con esa cédula, RUC o correo.');
      throw error;
    });

    await this.audit.registrar({
      userId: user.id,
      accion: 'REGISTRO_USUARIO',
      modulo: 'AUTH',
      resultado: 'OK',
    });

    return this.emitirTokens(user.id, user.email, user.sessionVersion);
  }

  async login(dto: LoginDto, ip?: string) {
    if (Boolean(dto.ruc) === Boolean(dto.email)) throw new BadRequestException('Indica cédula, RUC o correo en un solo campo.');
    const user = await this.prisma.user.findUnique({ where: dto.ruc ? { ruc: dto.ruc } : { email: dto.email } });

    // Mismo mensaje de error exista o no el usuario: evita filtrar qué
    // correos están registrados (enumeración de usuarios).
    if (!user || !user.activo) {
      await this.audit.registrar({
        accion: 'LOGIN',
        modulo: 'AUTH',
        resultado: 'ERROR',
        ip,
      });
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    const passwordValida = await argon2.verify(user.passwordHash, dto.password);
    await this.prisma.loginHistory.create({
      data: { userId: user.id, ip, exitoso: passwordValida },
    });

    if (!passwordValida) {
      await this.audit.registrar({
        userId: user.id,
        accion: 'LOGIN',
        modulo: 'AUTH',
        resultado: 'ERROR',
        ip,
      });
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    await this.audit.registrar({
      userId: user.id,
      accion: 'LOGIN',
      modulo: 'AUTH',
      resultado: 'OK',
      ip,
    });

    return this.emitirTokens(user.id, user.email, user.sessionVersion);
  }

  async refresh(refreshTokenPlano: string) {
    const tokenHash = this.hashToken(refreshTokenPlano);
    const registro = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revocado: false, expiraEn: { gt: new Date() } },
    });
    if (!registro) {
      throw new UnauthorizedException('Sesión inválida o expirada, inicia sesión de nuevo.');
    }

    // Consume el token una sola vez, incluso ante renovaciones simultáneas.
    const consumed = await this.prisma.refreshToken.updateMany({
      where: { id: registro.id, revocado: false, expiraEn: { gt: new Date() } },
      data: { revocado: true },
    });
    if (consumed.count !== 1) throw new UnauthorizedException('Sesión inválida o expirada.');

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: registro.userId } });
    if (!user.activo || (registro.sessionVersion ?? 0) !== (user.sessionVersion ?? 0)) throw new UnauthorizedException('Sesión inválida.');
    await this.audit.registrar({ userId: user.id, accion: 'REFRESH', modulo: 'AUTH', resultado: 'OK' });
    return this.emitirTokens(user.id, user.email, user.sessionVersion);
  }

  async logout(refreshTokenPlano: string) {
    const tokenHash = this.hashToken(refreshTokenPlano);
    const token = await this.prisma.refreshToken.findFirst({ where: { tokenHash } });
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revocado: true },
    });
    if (token) await this.audit.registrar({ userId: token.userId, accion: 'LOGOUT', modulo: 'AUTH', resultado: 'OK' });
  }

  private async emitirTokens(userId: string, email: string | null, sessionVersion = 0) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, sv: sessionVersion },
      { expiresIn: ACCESS_TOKEN_TTL },
    );

    const refreshTokenPlano = randomUUID() + randomUUID();
    const expiraEn = new Date();
    expiraEn.setDate(expiraEn.getDate() + REFRESH_TOKEN_TTL_DIAS);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        sessionVersion,
        tokenHash: this.hashToken(refreshTokenPlano),
        expiraEn,
      },
    });

    return { accessToken, refreshToken: refreshTokenPlano, expiresIn: ACCESS_TOKEN_TTL };
  }

  /// El refresh token nunca se guarda en texto plano en la base — solo su
  /// hash, igual que una contraseña — así una fuga de la tabla no permite
  /// reutilizar sesiones directamente.
  private hashToken(tokenPlano: string): string {
    return require('crypto').createHash('sha256').update(tokenPlano).digest('hex');
  }
}
