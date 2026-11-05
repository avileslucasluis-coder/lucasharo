import { PermissionsGuard } from '../src/rbac/permissions.guard';
import { VouchersService } from '../src/vouchers/vouchers.service';

describe('Aislamiento de empresas', () => {
  const context = (request: any) => ({
    getHandler: () => 'handler', getClass: () => 'controller',
    switchToHttp: () => ({ getRequest: () => request }),
  }) as any;
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['comprobantes.importar']) };
  it.each([
    { params: { companyId: 'propia' }, body: { companyId: 'ajena' } },
    { body: { companyId: 'propia' }, query: { companyId: 'ajena' } },
    { query: { companyId: ['propia', 'ajena'] } },
    { body: { companyId: {} } },
    { query: { companyId: '' } },
  ])('rechaza contexto ambiguo antes de consultar datos (%j)', async request => {
    const findUnique = jest.fn();
    const guard = new PermissionsGuard(reflector as any, { companyUser: { findUnique } } as any);
    await expect(guard.canActivate(context({ user: { userId: 'u' }, ...request }))).rejects.toMatchObject({ status: 403 });
    expect(findUnique).not.toHaveBeenCalled();
  });
  it('rechaza una empresa ajena aunque se conozca su identificador', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const guard = new PermissionsGuard(reflector as any, { companyUser: { findUnique } } as any);
    await expect(guard.canActivate(context({ user: { userId: 'u' }, query: { companyId: 'ajena' } }))).rejects.toMatchObject({ status: 403 });
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId_userId: { companyId: 'ajena', userId: 'u' } } }));
  });
  it('rechaza roles sin permiso y permite el rol autorizado', async () => {
    const findUnique = jest.fn().mockResolvedValue({ roleId: 'r', role: { rolePermissions: [] } });
    const guard = new PermissionsGuard(reflector as any, { companyUser: { findUnique } } as any);
    const request = { user: { userId: 'u' }, body: { companyId: 'propia' } };
    await expect(guard.canActivate(context(request))).rejects.toMatchObject({ status: 403 });
    findUnique.mockResolvedValue({ roleId: 'r', role: { rolePermissions: [{ permission: { codigo: 'comprobantes.importar' } }] } });
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
  });
});

describe('Períodos de consulta documental', () => {
  it.each([[0, 2026], [13, 2026], [1.5, 2026], [10, undefined], [undefined, 2026], [NaN, 2026], [10, 1999]])(
    'no transforma un filtro inválido en un listado completo (%s, %s)', async (mes, anio) => {
      const findMany = jest.fn();
      await expect(new VouchersService({ voucher: { findMany } } as any, {} as any).listar('empresa', mes, anio)).rejects.toMatchObject({ status: 400 });
      expect(findMany).not.toHaveBeenCalled();
    },
  );
  it('mantiene el filtro de empresa y omite el XML en el listado', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'v', xmlOriginal: 'privado' }]);
    const service = new VouchersService({ voucher: { findMany } } as any, {} as any);
    await expect(service.listar('empresa', 12, 2026)).resolves.toEqual([{ id: 'v', detalleImpuestos: [] }]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'empresa', fechaEmision: { gte: new Date(2026, 11, 1), lt: new Date(2027, 0, 1) } } }));
  });
});
