import { assertPeriodOpen } from '../src/declarations/period-lock';
import { declarationSource } from '../src/declarations/declaration-source';
describe('Cierre de períodos y detalle histórico', () => {
  it('rechaza un mes cubierto por un cierre mensual, semestral o anual', async () => {
    const tx: any = { $executeRaw: jest.fn(), taxDeclaration: { count: jest.fn().mockResolvedValue(1) } };
    await expect(assertPeriodOpen(tx, 'empresa', [new Date('2026-10-01Z')])).rejects.toThrow('cerrado');
    expect(tx.taxDeclaration.count.mock.calls[0][0].where).toEqual({ companyId: 'empresa', anio: 2026, estado: 'CERRADA', OR: [
      { periodicidad: 'ANUAL' }, { periodicidad: 'MENSUAL', mes: 10 }, { periodicidad: 'SEMESTRAL', mes: 12 },
    ] });
  });
  it('la huella es estable por orden y detecta cambios en importes', () => {
    const a = { id:'a', tipoComprobante:'NOTA_CREDITO', fechaEmision:new Date('2026-10-01Z'), baseImponibleIva:'10', baseImponibleIva0:'0', montoIva:'1.5' };
    const b = { ...a, id:'b', tipoComprobante:'FACTURA' };
    const original = declarationSource([a,b]);
    expect(original.huellaComprobantes).toBe(declarationSource([b,a]).huellaComprobantes);
    expect(original.huellaComprobantes).not.toBe(declarationSource([{...a,montoIva:'2'},b]).huellaComprobantes);
    expect(original.detalleComprobantes[0].signo).toBe(-1);
  });
});
