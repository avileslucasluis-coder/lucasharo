import { DeclarationsService } from '../src/declarations/declarations.service';

function transaccional(prisma: any) {
  prisma.company ??= { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'empresa' }) };
  prisma.atsOperation ??= { findMany: jest.fn().mockResolvedValue([]) };
  prisma.periodDecision ??= { findMany: jest.fn().mockResolvedValue([]) };
  prisma.taxDeclaration.count ??= jest.fn().mockResolvedValue(0);
  prisma.taxDeclaration.findUnique ??= jest.fn().mockResolvedValue(null);
  prisma.$executeRaw = jest.fn().mockResolvedValue(1);
  prisma.declarationRevision = { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() };
  prisma.$transaction = (callback: any) => callback(prisma);
  return prisma;
}

describe('Papel de trabajo 103 y104', () => {
  it('recupera la conciliación del mismo período y separa los saldos por origen', async () => {
    const ajustes = {creditoAnteriorCompras:'0.00',creditoAnteriorRetenciones:'707.62',factorCredito:'1',justificacion:'Saldo de declaración anterior verificada'};
    const prisma:any = transaccional({voucher:{findMany:jest.fn().mockResolvedValue([{tipoComprobante:'FACTURA',direccion:'COMPRA',baseImponibleIva:'497.96',baseImponibleIva0:'360.83',montoIva:'74.69',montoRentaRetenida:'0'}])},taxDeclaration:{findUnique:jest.fn().mockResolvedValue({id:'decl',ajustes}),upsert:jest.fn(async ({create})=>({id:'decl',...create}))}});
    const service = new DeclarationsService(prisma,{registrar:jest.fn()} as any);
    const result = await service.generarParaPeriodo('empresa',10,2026,'usuario');
    expect((result.liquidacion as any).creditoAnteriorRetenciones).toBe('707.62');
    expect((result.liquidacion as any).creditoSiguienteCompras).toBe('74.69');
    expect((result.liquidacion as any).creditoSiguienteRetenciones).toBe('707.62');
    expect(result.totalAPagar104).toBe(0);
    expect(prisma.taxDeclaration.upsert.mock.calls[0][0].update.ajustes).toEqual(ajustes);
    const reset = await service.generarParaPeriodo('empresa',10,2026,'usuario','MENSUAL',{creditoAnteriorRetenciones:'0.00',justificacion:'Corrección sustentada sin saldo anterior'});
    expect((reset.liquidacion as any).creditoAnteriorRetenciones).toBe('0.00');
  });
  it.each([[6, '2026-01-01', '2026-07-01'], [12, '2026-07-01', '2027-01-01']])(
    'consolida el semestre de cierre %s con límites independientes de la zona horaria', async (mes, desde, hasta) => {
      const prisma: any = { voucher: { findMany: jest.fn().mockResolvedValue([]) },
        taxDeclaration: { upsert: jest.fn(async ({ create }) => ({ id: 'semester', ...create })) } };
      const result = await new DeclarationsService(transaccional(prisma), { registrar: jest.fn() } as any)
        .generarParaPeriodo('empresa', mes as number, 2026, 'usuario', 'SEMESTRAL');
      expect(prisma.voucher.findMany.mock.calls[0][0].where.fechaEmision).toEqual({
        gte: new Date(desde + 'T00:00:00Z'), lt: new Date(hasta + 'T00:00:00Z'),
      });
      expect(result.periodicidad).toBe('SEMESTRAL');
      expect(result.alcance).toBe('PAPEL_TRABAJO_SEMESTRAL');
      expect(prisma.taxDeclaration.upsert.mock.calls[0][0].where.companyId_mes_anio_periodicidad.periodicidad).toBe('SEMESTRAL');
    });

  it('rechaza un cierre semestral inválido antes de leer comprobantes', async () => {
    const service = new DeclarationsService({} as any, {} as any);
    await expect(service.generarParaPeriodo('empresa', 7, 2026, 'usuario', 'SEMESTRAL')).rejects.toThrow('junio o diciembre');
  });

  it('no genera un semestre que incluye una presentación mensual registrada', async () => {
    const prisma: any = { voucher: { findMany: jest.fn().mockResolvedValue([]) },
      taxDeclaration: { count: jest.fn(async ({where}) => where.estado === 'CERRADA' ? 0 : 1), upsert: jest.fn() } };
    await expect(new DeclarationsService(transaccional(prisma), {} as any)
      .generarParaPeriodo('empresa', 6, 2026, 'usuario', 'SEMESTRAL')).rejects.toThrow('superpuesto');
    expect(prisma.taxDeclaration.upsert).not.toHaveBeenCalled();
  });
  it('conserva centavos al compensar compras, ventas y notas de crédito', async () => {
    const base = { tipoComprobante: 'FACTURA', direccion: 'VENTA', baseImponibleIva: '0', baseImponibleIva0: '0', montoIva: '0', montoRentaRetenida: '0' };
    const prisma: any = { voucher: { findMany: jest.fn().mockResolvedValue([
      { ...base, montoIva: '0.10' }, { ...base, montoIva: '0.20' },
      { ...base, direccion: 'COMPRA', montoIva: '0.25' },
      { ...base, tipoComprobante: 'NOTA_CREDITO', montoIva: '0.10' },
    ]) }, taxDeclaration: { upsert: jest.fn(async ({ create }) => ({ id: 'id', ...create })) } };
    const r = await new DeclarationsService(transaccional(prisma), { registrar: jest.fn() } as any).generarParaPeriodo('empresa', 12, 2026, 'usuario');
    expect(r.totalIvaVentas).toBe(0.2);
    expect(r.ivaAPagar104).toBe(0);
    expect(r.creditoTributarioSiguientePeriodo).toBe(0.05);
  });
  it('103 solo contiene renta y 104 incorpora IVA retenido efectivamente emitido', async () => {
    const base = { tipoComprobante: 'FACTURA', baseImponibleIva: 0, baseImponibleIva0: 0, montoIva: 0, montoRentaRetenida: 0 };
    const prisma: any = { voucher: { findMany: jest.fn().mockResolvedValue([
      { ...base, direccion: 'VENTA', baseImponibleIva: 200, montoIva: 30 },
      { ...base, direccion: 'COMPRA', baseImponibleIva: 100, montoIva: 15, withholding: { valorRetenidoIva: 999, valorRetenidoRenta: 999 } },
      { ...base, tipoComprobante: 'RETENCION', direccion: 'RETENCION_EMITIDA', montoIva: 10.50, montoRentaRetenida: 2 },
      { ...base, tipoComprobante: 'RETENCION', direccion: 'RETENCION_RECIBIDA', montoIva: 3, montoRentaRetenida: 4 },
    ]) }, taxDeclaration: { upsert: jest.fn(async ({ create }) => ({ id: 'declaracion', ...create })) } };
    const resultado = await new DeclarationsService(transaccional(prisma), { registrar: jest.fn() } as any).generarParaPeriodo('empresa', 10, 2026, 'usuario');
    expect(resultado.totalAPagar103).toBe(2);
    expect(resultado.ivaAPagar104).toBe(12);
    expect(resultado.totalAPagar104).toBe(22.5);
    expect(resultado.rentaRetenidaEnVentasInformativo).toBe(4);
    expect(resultado.alcance).toBe('PAPEL_TRABAJO_MENSUAL');
  });
  it('registrar presentación manual nunca indica envío al SRI', async () => {
    const prisma: any = { taxDeclaration: { findUnique: jest.fn().mockResolvedValue({ id: 'id' }), update: jest.fn(async ({ data }) => ({ id: 'id', ...data })) } };
    const r = await new DeclarationsService(transaccional(prisma), { registrar: jest.fn() } as any).marcarPresentada('empresa', 10, 2026, 'usuario');
    expect(r.enviadaAlSri).toBe(false);
    expect(r.estado).toBe('PRESENTADA_LOCAL');
  });
});
