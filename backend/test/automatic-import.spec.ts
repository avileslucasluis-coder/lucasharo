import { VouchersService } from '../src/vouchers/vouchers.service';
import { VouchersController } from '../src/vouchers/vouchers.controller';
import { PERMISSIONS_KEY } from '../src/rbac/permissions.decorator';

const key = '0111202601179001234500120010010000000011234567811';
const xml = (buyer = '0912345678', access = key) => `<factura><infoTributaria><ruc>1790012345001</ruc><claveAcceso>${access}</claveAcceso></infoTributaria><infoFactura><fechaEmision>01/11/2026</fechaEmision><identificacionComprador>${buyer}</identificacionComprador><importeTotal>115</importeTotal><totalConImpuestos><totalImpuesto><codigo>2</codigo><codigoPorcentaje>4</codigoPorcentaje><baseImponible>100</baseImponible><valor>15</valor></totalImpuesto></totalConImpuestos></infoFactura></factura>`;
function setup() {
  const voucher = { id: 'v', companyId: 'c', claveAcceso: key, clasificacionPendiente: true, fechaEmision: new Date('2026-11-01') };
  const prisma: any = {
    company: { findUnique: jest.fn().mockResolvedValue({ ruc: '0912345678001' }) },
    voucher: {
      findUnique: jest.fn().mockResolvedValue(voucher), findMany: jest.fn().mockResolvedValue([{ claveAcceso: key }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: jest.fn().mockResolvedValue({ ...voucher, clasificacionPendiente: false }),
    },
    $executeRaw: jest.fn(), taxDeclaration: { count: jest.fn().mockResolvedValue(0) },
  };
  prisma.$transaction = (fn: any) => fn(prisma);
  const sri: any = { consultar: jest.fn().mockResolvedValue({ autorizaciones: [{ estado: 'AUTORIZADO', ambiente: 'PRODUCCION', comprobante: xml() }] }) };
  return { prisma, sri, service: new VouchersService(prisma, { registrar: jest.fn() } as any, sri) };
}
describe('Completar TXT mediante consulta de solo lectura al SRI', () => {
  it('completa el mismo registro con el desglose real y la cédula equivalente', async () => {
    const { service, prisma, sri } = setup();
    await expect(service.completarSri('c', key, 'u')).resolves.toEqual({ completado: true });
    expect(sri.consultar).toHaveBeenCalledWith(key, 'PRODUCCION');
    expect(prisma.voucher.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'v', companyId: 'c', clasificacionPendiente: true },
      data: expect.objectContaining({ clasificacionPendiente: false, montoIva: 15, detalleImpuestos: [expect.objectContaining({ tarifa: '15', base: 100 })] }),
    }));
  });
  it('exige un TXT previamente importado en la empresa autorizada', async () => {
    const { service, prisma, sri } = setup();
    prisma.voucher.findUnique.mockResolvedValue(null);
    await expect(service.completarSri('ajena', key, 'u')).rejects.toThrow('Primero importa');
    expect(prisma.voucher.findUnique).toHaveBeenCalledWith({ where: { companyId_claveAcceso: { companyId: 'ajena', claveAcceso: key } } });
    expect(sri.consultar).not.toHaveBeenCalled();
  });
  it('no vuelve a consultar ni modificar un registro ya completado', async () => {
    const { service, prisma, sri } = setup();
    prisma.voucher.findUnique.mockResolvedValue({ clasificacionPendiente: false });
    await expect(service.completarSri('c', key, 'u')).resolves.toEqual({ completado: true });
    expect(sri.consultar).not.toHaveBeenCalled();
  });
  it.each([
    [], [{ estado: 'NO AUTORIZADO', ambiente: 'PRODUCCION', comprobante: xml() }],
    [{ estado: 'AUTORIZADO', ambiente: 'PRUEBAS', comprobante: xml() }],
    [{ estado: 'AUTORIZADO', ambiente: 'PRODUCCION', comprobante: xml('0912345679') }],
    [{ estado: 'AUTORIZADO', ambiente: 'PRODUCCION', comprobante: xml('0912345678', 'otra') }],
  ])('deja pendiente una respuesta no válida (%j)', async (...items) => {
    const { service, prisma, sri } = setup();
    sri.consultar.mockResolvedValue({ autorizaciones: items });
    await expect(service.completarSri('c', key, 'u')).rejects.toThrow();
    expect(prisma.voucher.updateMany).not.toHaveBeenCalled();
  });
  it('permite reintentar después de una caída del SRI', async () => {
    const { service, prisma, sri } = setup();
    sri.consultar.mockRejectedValueOnce(new Error('SRI no disponible'));
    await expect(service.completarSri('c', key, 'u')).rejects.toThrow('SRI no disponible');
    expect(prisma.voucher.updateMany).not.toHaveBeenCalled();
    await expect(service.completarSri('c', key, 'u')).resolves.toEqual({ completado: true });
  });
  it('respeta un período cerrado', async () => {
    const { service, prisma } = setup();
    prisma.taxDeclaration.count.mockResolvedValue(1);
    await expect(service.completarSri('c', key, 'u')).rejects.toThrow();
    expect(prisma.voucher.updateMany).not.toHaveBeenCalled();
  });
  it('lista pendientes solo de la empresa y protege ambos endpoints', async () => {
    const { service, prisma } = setup();
    await service.pendientesDetalle('c');
    expect(prisma.voucher.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'c', clasificacionPendiente: true } }));
    for (const handler of [VouchersController.prototype.completar, VouchersController.prototype.pendientes]) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(['comprobantes.importar']);
    }
  });
});
