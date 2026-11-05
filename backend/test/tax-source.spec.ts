import { taxSource } from '../src/declarations/tax-source';
import { DeclarationsService } from '../src/declarations/declarations.service';

const company: any = { id: 'c', ruc: '0999999999001', regimen: 'GENERAL', deberesFormalesRegistrados: [] };
const voucher: any = { id: 'v', companyId: 'c', claveAcceso: 'auth', direccion: 'COMPRA', tipoComprobante: 'FACTURA',
  fechaEmision: new Date('2026-10-10Z'), fechaRegistroAts: null, baseImponibleIva: '100', baseImponibleIva0: '0',
  montoIva: '15', montoRentaRetenida: '0', importeTotal: '115', atsRevision: { parteRelacionada: 'NO' }, xmlOriginal: '<factura/>' };
const operation: any = { id: 'o', companyId: 'c', kind: 'IMPORTACION', mes: 10, anio: 2026, version: 1,
  voucherId: 'v', data: { autorizacion: 'auth', montoIva: '15' } };

describe('Inventario compartido IVA y ATS', () => {
  it('mantiene la compra del mismo período sin inventar decisiones tributarias', () => {
    const r = taxSource(company, [voucher], [], '2026-10');
    expect(r.issues).toEqual([]);
    expect(r.snapshot.documents[0]).toMatchObject({ inEmissionPeriod: true, inAtsPeriod: true });
    expect(r.changesTaxCalculation).toBe(false);
  });
  it('identifica octubre/noviembre sin alterar fechas', () => {
    const v = { ...voucher, fechaRegistroAts: new Date('2026-11-05Z') };
    const r = taxSource(company, [v], [], '2026-11');
    expect(r.snapshot.documents[0]).toMatchObject({ emissionPeriod: '2026-10', atsPeriod: '2026-11', inEmissionPeriod: false });
    expect(r.issues[0].code).toBe('PERIOD_DECISION_REQUIRED');
    expect(v.fechaEmision).toEqual(voucher.fechaEmision);
  });
  it('representa una importación enlazada como complemento, no como otro comprobante', () => {
    const r = taxSource(company, [voucher], [operation], '2026-10');
    expect(r.snapshot.documents).toHaveLength(1);
    expect(r.snapshot.complementary[0].representation).toBe('LINKED_COMPLEMENT');
    expect(r.issues.map(i => i.code)).toEqual(['TAX_TREATMENT_REQUIRED']);
  });
  it('requiere revisión para importaciones independientes y detecta duplicados por autorización', () => {
    const independent = { ...operation, voucherId: null };
    expect(taxSource(company, [], [independent], '2026-10').issues.map(i => i.code)).toEqual(['TAX_TREATMENT_REQUIRED']);
    expect(taxSource(company, [voucher], [independent], '2026-10').issues.map(i => i.code)).toContain('POSSIBLE_DUPLICATE');
  });
  it('rechaza fuentes de otra empresa y señala enlaces rotos', () => {
    expect(() => taxSource(company, [{ ...voucher, companyId: 'other' }], [], '2026-10')).toThrow('otra empresa');
    expect(taxSource(company, [], [operation], '2026-10').issues.map(i => i.code)).toContain('LINK_NOT_FOUND');
  });
  it('la huella detecta fechas, revisiones, perfil y operaciones sin depender del orden de claves', () => {
    const hash = taxSource(company, [voucher], [operation], '2026-10').fingerprint;
    expect(taxSource(company, [voucher], [{ ...operation, data: { montoIva: '15', autorizacion: 'auth' } }], '2026-10').fingerprint).toBe(hash);
    for (const v of [{ ...voucher, fechaRegistroAts: new Date('2026-11-05Z') }, { ...voucher, atsRevision: { parteRelacionada: 'SI' } }])
      expect(taxSource(company, [v], [operation], '2026-10').fingerprint).not.toBe(hash);
    expect(taxSource({ ...company, regimen: 'RIMPE' }, [voucher], [operation], '2026-10').fingerprint).not.toBe(hash);
    expect(taxSource(company, [voucher], [{ ...operation, version: 2 }], '2026-10').fingerprint).not.toBe(hash);
  });
  it('consulta fuentes con aislamiento consistente y limita todas las lecturas a la empresa', async () => {
    const tx = { company: { findUnique: jest.fn().mockResolvedValue(company) },
      atsOperation: { findMany: jest.fn().mockResolvedValue([operation]) }, voucher: { findMany: jest.fn().mockResolvedValue([voucher]) } };
    const db = { $transaction: jest.fn(async (fn, _options?: unknown) => fn(tx)) };
    const service = new DeclarationsService(db as any, {} as any);
    await service.fuentes('c', 10, 2026);
    expect(db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'RepeatableRead' });
    expect(tx.voucher.findMany.mock.calls[0][0].where.companyId).toBe('c');
    expect(tx.atsOperation.findMany).toHaveBeenCalledWith({ where: { companyId: 'c', mes: 10, anio: 2026 } });
    await expect(service.fuentes('c', 13, 2026)).rejects.toThrow('mes');
  });
});
