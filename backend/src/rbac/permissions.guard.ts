import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { PERMISSIONS_KEY } from './permissions.decorator';

/// Verifica que el usuario autenticado tenga, DENTRO DE LA EMPRESA que la
/// petición indica (params.companyId o body.companyId), un rol que incluya
/// todos los permisos requeridos por el endpoint. Nunca se resuelve el
/// permiso solo por estar logueado, y nunca se confía en un companyId que
/// el usuario no tenga asignado — eso es exactamente lo que evita que un
/// usuario de una empresa lea datos de otra.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permisosRequeridos = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!permisosRequeridos || permisosRequeridos.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.userId;
    const companyIds: unknown[] = [request.params?.companyId, request.body?.companyId, request.query?.companyId]
      .filter(value => value !== undefined);

    if (!userId) throw new ForbiddenException('No autenticado.');
    if (!companyIds.length || companyIds.some(value => typeof value !== 'string' || !value.trim())) {
      throw new ForbiddenException('La petición debe indicar companyId.');
    }
    const companyId = companyIds[0] as string;
    if (companyIds.some(value => value !== companyId)) {
      throw new ForbiddenException('Los identificadores de empresa de la petición no coinciden.');
    }

    const companyUser = await this.prisma.companyUser.findUnique({
      where: { companyId_userId: { companyId, userId } },
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
    });

    if (!companyUser) {
      throw new ForbiddenException('No tienes acceso a esta empresa.');
    }

    const permisosDelRol = new Set(
      companyUser.role.rolePermissions.map((rp: (typeof companyUser.role.rolePermissions)[number]) => rp.permission.codigo),
    );
    const tieneTodos = permisosRequeridos.every((p) => permisosDelRol.has(p));
    if (!tieneTodos) {
      throw new ForbiddenException('Tu rol no tiene permiso para esta acción.');
    }

    // Se deja disponible en el request por si el controller lo necesita
    // (ej. para filtrar por company_id sin volver a consultar).
    request.companyContext = { companyId, roleId: companyUser.roleId };
    return true;
  }
}
