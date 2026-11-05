import { ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/// Protege cualquier ruta que requiera sesión iniciada. Se usa como
/// @UseGuards(JwtAuthGuard) en los controllers; el RBAC (PermissionsGuard)
/// se aplica encima de este, nunca lo reemplaza.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    if (context.switchToHttp().getRequest().user?.requiresIdentity &&
        !Reflect.getMetadata('allowIncompleteIdentity', context.getHandler())) {
      throw new ForbiddenException({ code: 'IDENTITY_REQUIRED', message: 'Completa tu cédula o RUC antes de continuar.' });
    }
    return true;
  }
}

export const AllowIncompleteIdentity = () => SetMetadata('allowIncompleteIdentity', true);
