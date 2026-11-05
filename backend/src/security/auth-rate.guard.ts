import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthRateGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const action = context.getHandler().name;
    const identities = [`ip:${req.ip ?? req.socket.remoteAddress}`];
    if (typeof req.body?.ruc === 'string') identities.push(`account:ruc:${req.body.ruc.trim()}`);
    if (typeof req.body?.email === 'string') identities.push(`account:${req.body.email.trim().toLowerCase()}`);
    for (const identity of identities) {
      const key = createHmac('sha256', process.env.JWT_SECRET!).update(`${action}:${identity}`).digest('hex');
      // A single atomic PostgreSQL upsert works across serverless instances.
      const rows = await this.prisma.$queryRaw<Array<{ attempts: number; expires_at: Date }>>`
        INSERT INTO security_rate_limits (key, attempts, expires_at)
        VALUES (${key}, 1, NOW() + INTERVAL '15 minutes')
        ON CONFLICT (key) DO UPDATE SET
          attempts = CASE WHEN security_rate_limits.expires_at <= NOW() THEN 1 ELSE security_rate_limits.attempts + 1 END,
          expires_at = CASE WHEN security_rate_limits.expires_at <= NOW() THEN NOW() + INTERVAL '15 minutes' ELSE security_rate_limits.expires_at END
        RETURNING attempts, expires_at`;
      const limit = identity.startsWith('account:') ? 15 : action === 'register' ? 10 : 100;
      if (rows[0].attempts > limit) {
        res.setHeader('Retry-After', Math.max(1, Math.ceil((rows[0].expires_at.getTime() - Date.now()) / 1000)));
        throw new HttpException('Demasiados intentos. Intenta más tarde.', 429);
      }
    }
    return true;
  }
}
