import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/// Marca un endpoint con el/los permiso(s) exactos que requiere, ej.
/// @RequirePermissions('ats.generate'). El PermissionsGuard los verifica
/// contra el rol que el usuario tiene EN LA EMPRESA de la petición — nunca
/// un permiso global implícito por estar autenticado.
export const RequirePermissions = (...permisos: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permisos);
