import { declarationReport } from '../src/declarations/declaration-report';
import { DeclarationsService } from '../src/declarations/declarations.service';

describe('Reporte y saldos anteriores', () => {
  it('exporta los valores históricos y neutraliza fórmulas y comillas', () => {
    const csv = declarationReport({ companyId: 'empresa', mes: 10, anio: 2026, totalIvaCompras: '93.24',
      ajustes: { justificacion: '=HYPERLINK("destino")\ntexto' }, liquidacion: { creditoSiguienteRetenciones: '707.62' } }, 3, new Date('2026-11-01Z'));
    expect(csv).toContain(';93,24');
    expect(csv).toContain(';707,62');
    expect(csv).toContain('"\'=HYPERLINK(""destino"")\ntexto"');
    expect(csv).toContain('"Versión";"3"');
  });

  it('limita la descarga a la versión y empresa solicitadas', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new DeclarationsService({ declarationRevision: { findFirst } } as any, {} as any);
    await expect(service.reporte('otra', 'id', 2)).rejects.toThrow('no encontrada');
    expect(findFirst).toHaveBeenCalledWith({ where: { declarationId: 'id', version: 2, declaration: { companyId: 'otra' } } });
    await expect(service.reporte('otra', 'id', NaN)).rejects.toThrow('inválida');
  });

  const fixture = () => {
    const prisma = {
      taxDeclaration: { findUnique: jest.fn().mockResolvedValue({ id: 'prev', mes: 12, anio: 2025 }) },
      declarationRevision: { findFirst: jest.fn().mockResolvedValue({ version: 4, snapshot: { liquidacion: {
        conciliado: true, creditoSiguienteCompras: '93.24', creditoSiguienteRetenciones: '707.62',
      } } }) },
      taxFiling: { findFirst: jest.fn().mockResolvedValue({ numero: 'respaldo', fecha: new Date() }) },
    };
    return { prisma, service: new DeclarationsService(prisma as any, {} as any) };
  };

  it.each([[1, 'MENSUAL'], [6, 'SEMESTRAL']])('resuelve el período anterior al cambio de año (%s)', async (mes, periodicidad) => {
    const { prisma, service } = fixture();
    const result = await service.saldoAnterior('empresa', mes as number, 2026, periodicidad as string);
    expect(prisma.taxDeclaration.findUnique).toHaveBeenCalledWith({ where: { companyId_mes_anio_periodicidad: {
      companyId: 'empresa', mes: 12, anio: 2025, periodicidad,
    } } });
    expect(result.creditoAnteriorRetenciones).toBe('707.62');
    expect(result.creditoAnteriorCompras).toBe('93.24');
    expect(prisma.taxFiling.findFirst.mock.calls[0][0].where).toEqual({ declarationId: 'prev', revision: 4, formulario: '104', tipo: 'PRESENTACION' });
  });

  it('rechaza borradores sin presentación de la última versión', async () => {
    const { prisma, service } = fixture();
    prisma.taxFiling.findFirst.mockResolvedValue(null);
    await expect(service.saldoAnterior('empresa', 2, 2026)).rejects.toThrow('borradores');
  });

  it('rechaza saldos negativos, faltantes o sin conciliación', async () => {
    const { prisma, service } = fixture();
    prisma.declarationRevision.findFirst.mockResolvedValue({ version: 4, snapshot: { liquidacion: { conciliado: true, creditoSiguienteCompras: '-1.00' } } });
    await expect(service.saldoAnterior('empresa', 2, 2026)).rejects.toThrow('conciliados');
    await expect(service.saldoAnterior('empresa', 12, 2026, 'ANUAL')).rejects.toThrow('IVA');
  });
});
