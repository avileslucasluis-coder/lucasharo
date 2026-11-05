import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { jwtSecret } from '../../security/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string; // userId
  email: string | null;
  sv?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret(config.get<string>('JWT_SECRET')),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user?.activo || (payload.sv ?? 0) !== user.sessionVersion) throw new UnauthorizedException('Sesión inválida.');
    // Lo que se retorna aquí queda disponible como request.user en cada
    // controller protegido con JwtAuthGuard.
    return { userId: payload.sub, email: payload.email, requiresIdentity: !/^(?:[0-9]{10}|[0-9]{13})$/.test(user.ruc ?? '') };
  }
}
