import { VouchersService } from '../src/vouchers/vouchers.service';
import { VouchersController } from '../src/vouchers/vouchers.controller';
import { PERMISSIONS_KEY } from '../src/rbac/permissions.decorator';
import { parseSriTxt } from '../src/vouchers/txt-parser';
import { taxSummary } from '../src/vouchers/tax-detail';

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
  it.each(['PRODUCCIÓN', 'PRODUCCION', ' producción ', '2'])('completa una factura de producción con ambiente %s', async ambiente => {
    const { service, sri, prisma } = setup();
    sri.consultar.mockResolvedValue({ autorizaciones: [{ estado: 'AUTORIZADO', ambiente, comprobante: xml() }] });
    await expect(service.completarSri('c', key, 'u')).resolves.toEqual({ completado: true });
    expect(prisma.voucher.updateMany).toHaveBeenCalled();
  });

  it.each(['PRUEBAS', '1', '', 'DESCONOCIDO'])('sigue rechazando el ambiente %s', async ambiente => {
    const { service, sri, prisma } = setup();
    sri.consultar.mockResolvedValue({ autorizaciones: [{ estado: 'AUTORIZADO', ambiente, comprobante: xml() }] });
    await expect(service.completarSri('c', key, 'u')).rejects.toThrow('ambiente de producción');
    expect(prisma.voucher.updateMany).not.toHaveBeenCalled();
  });

  it.each([['1.0.0', 'RECIBIDOS'], ['2.0.0', 'RECIBIDOS'], ['1.0.0', 'EMITIDOS'], ['2.0.0', 'EMITIDOS']] as const)(
    'completa retención XML %s %s y separa todas las tarifas IVA y renta', async (version, sentido) => {
      const { service, sri, prisma } = setup();
      const access = key.slice(0, 8) + '07' + key.slice(10);
      const emisor = sentido === 'RECIBIDOS' ? '1790012345001' : '0912345678001';
      const receptor = sentido === 'RECIBIDOS' ? '0912345678' : '1790012345001';
      const txt = `CLAVE_ACCESO\tRUC_EMISOR\tIDENTIFICACION_RECEPTOR\tFECHA_EMISION\tTIPO_COMPROBANTE\n${access}\t${emisor}\t${receptor}\t01/11/2026\tComprobante de Retención`;
      const [pending] = parseSriTxt(txt, '0912345678001', sentido);
      expect(pending.clasificacionPendiente).toBe(true);
      prisma.voucher.findUnique.mockResolvedValue({ ...pending, id: 'v' });
      const iva = [30, 70, 100, 0, 10, 20, 50];
      const renta = [15, 10, 5, 3, 2, 1, 0];
      const tag = version === '1.0.0' ? 'impuesto' : 'retencion';
      const lines = [[2, iva], [1, renta]].flatMap(([code, rates]) => (rates as number[]).map(rate => `<${tag}><codigo>${code}</codigo><codigoRetencion>1</codigoRetencion><baseImponible>100.00000</baseImponible><porcentajeRetener>${rate}.00</porcentajeRetener><valorRetenido>${rate}.00000</valorRetenido></${tag}>`)).join('');
      const detail = version === '1.0.0' ? `<impuestos>${lines}</impuestos>` : `<docsSustento><docSustento><retenciones>${lines}</retenciones></docSustento></docsSustento>`;
      const retention = `<comprobanteRetencion version="${version}"><infoTributaria><ambiente>2</ambiente><ruc>${emisor}</ruc><claveAcceso>${access}</claveAcceso></infoTributaria><infoCompRetencion><fechaEmision>01/11/2026</fechaEmision><identificacionSujetoRetenido>${receptor}</identificacionSujetoRetenido></infoCompRetencion>${detail}</comprobanteRetencion>`;
      sri.consultar.mockResolvedValue({ autorizaciones: [{ estado: 'AUTORIZADO', ambiente: 'PRODUCCIÓN', comprobante: retention }] });
      await service.completarSri('c', access, 'u');
      const data = prisma.voucher.updateMany.mock.calls[0][0].data;
      expect(data.direccion).toBe(sentido === 'RECIBIDOS' ? 'RETENCION_RECIBIDA' : 'RETENCION_EMITIDA');
      expect(data.tipoComprobante).toBe('RETENCION');
      expect(data.montoIva).toBe(280);
      expect(data.montoRentaRetenida).toBe(36);
      expect(data.importeTotal).toBe(316);
      const summary = taxSummary([data]);
      expect(summary.filter(l => l.grupo === 'RET_IVA').map(l => l.tarifa)).toEqual(iva.map(String));
      expect(summary.filter(l => l.grupo === 'RENTA').map(l => l.tarifa)).toEqual(renta.map(String));
      expect(summary.every(l => l.base === 100 && l.valor === Number(l.tarifa))).toBe(true);
    });
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
