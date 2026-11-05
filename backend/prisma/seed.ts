import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/// Catálogo base de permisos. Cada uno se referencia desde los
/// controllers con @RequirePermissions('codigo'). Agregar un permiso
/// nuevo es agregarlo aquí + asignarlo al rol que corresponda; nunca se
/// codifica un "if (rol === 'CONTADOR')" dentro de un controller.
const PERMISOS = [
  { codigo: 'empresas.editar_perfil', modulo: 'COMPANIES' },
  { codigo: 'empresas.crear', modulo: 'COMPANIES' },
  { codigo: 'empresas.gestionar_usuarios', modulo: 'COMPANIES' },
  { codigo: 'obligaciones.ver', modulo: 'TAX_RULES' },
  { codigo: 'comprobantes.importar', modulo: 'VOUCHERS' },
  { codigo: 'retenciones.editar', modulo: 'WITHHOLDINGS' },
  { codigo: 'declaraciones.generar', modulo: 'DECLARATIONS' },
  { codigo: 'declaraciones.presentar', modulo: 'DECLARATIONS' },
  { codigo: 'ats.validar', modulo: 'ATS' },
  { codigo: 'ats.generate', modulo: 'ATS' },
  { codigo: 'reportes.ver', modulo: 'REPORTS' },
  { codigo: 'auditoria.ver', modulo: 'AUDIT' },
  { codigo: 'sri.operar', modulo: 'SRI' },
];

const ROLES: Record<string, string[]> = {
  SUPER_ADMIN: PERMISOS.map((p) => p.codigo),
  ADMIN_EMPRESA: PERMISOS.map((p) => p.codigo).filter((c) => c !== 'auditoria.ver'),
  CONTADOR: [
    'obligaciones.ver',
    'comprobantes.importar',
    'retenciones.editar',
    'declaraciones.generar',
    'declaraciones.presentar',
    'ats.validar',
    'ats.generate',
    'reportes.ver',
    'sri.operar',
  ],
  AUXILIAR_CONTABLE: ['obligaciones.ver', 'comprobantes.importar', 'retenciones.editar', 'declaraciones.generar'],
  FACTURACION: ['comprobantes.importar', 'sri.operar'],
  AUDITOR: ['obligaciones.ver', 'reportes.ver', 'auditoria.ver'],
  CONSULTA: ['obligaciones.ver', 'reportes.ver'],
};

async function main() {
  for (const permiso of PERMISOS) {
    await prisma.permission.upsert({
      where: { codigo: permiso.codigo },
      create: permiso,
      update: {},
    });
  }

  for (const [nombreRol, permisos] of Object.entries(ROLES)) {
    const rol = await prisma.role.upsert({
      where: { nombre: nombreRol },
      create: { nombre: nombreRol },
      update: {},
    });

    for (const codigoPermiso of permisos) {
      const permiso = await prisma.permission.findUniqueOrThrow({ where: { codigo: codigoPermiso } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: rol.id, permissionId: permiso.id } },
        create: { roleId: rol.id, permissionId: permiso.id },
        update: {},
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log('Seed de roles y permisos completado.');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
