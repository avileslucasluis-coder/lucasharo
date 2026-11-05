import { liquidarIva, liquidarRenta, money } from '../src/declarations/tax-calculations';

describe('Liquidación conciliada', () => {
  it('separa crédito de compras y retenciones sin aplicarlo dos veces', () => {
    const r = liquidarIva(money(100), money(200), money(30), money(15));
    expect(r.ivaAPagar104).toBe('0.00');
    expect(r.creditoSiguienteCompras).toBe('100.00');
    expect(r.creditoSiguienteRetenciones).toBe('30.00');
    expect(r.totalAPagar104).toBe('15.00');
  });
  it('aplica proporcionalidad y crédito anterior con ajustes', () => {
    const r = liquidarIva(money(150), money(100), money(10), money(0), {
      factorCredito: '0.5', ivaSinDerechoCredito: '20', creditoAnteriorCompras: '15', ajusteCreditoCompras: '5', multa104: '2', interes104: '1',
    });
    expect(r.ivaComprasConDerechoCredito).toBe('40.00');
    expect(r.ivaAPagar104).toBe('90.00');
    expect(r.totalAPagar104).toBe('93.00');
  });
  it('rechaza créditos incompatibles con las compras', () => {
    expect(() => liquidarIva(money(0), money(10), money(0), money(0), { ivaSinDerechoCredito: '11' })).toThrow();
    expect(() => liquidarIva(money(0), money(10), money(0), money(0), { factorCredito: '1.1' })).toThrow();
  });
  it('liquida renta natural y limita la rebaja al impuesto causado', () => {
    const r = liquidarRenta(2026, 'GENERAL', 'NATURAL', { ingresosBrutos: '14000', rebajaGastosPersonales: '500', retencionesRenta: '10' });
    expect(r.impuestoCausado).toBe('89.60');
    expect(r.rebajaAplicada).toBe('89.60');
    expect(r.saldoFavorRenta).toBe('10.00');
  });
  it.each([[2500,'0.00'],[5000,'5.00'],[10000,'15.00'],[15000,'35.00'],[20000,'60.00']])('cuota popular en límite %s', (income, tax) => {
    expect(liquidarRenta(2026, 'RIMPE_NEGOCIO_POPULAR', 'NATURAL', { ingresosBrutos: String(income) }).impuestoCausado).toBe(tax);
  });
  it('requiere tarifa societaria explícita y bloquea años sin tabla', () => {
    expect(() => liquidarRenta(2026, 'GENERAL', 'SOCIEDAD', { ingresosBrutos: '1000' })).toThrow();
    expect(() => liquidarRenta(2027, 'GENERAL', 'NATURAL', { ingresosBrutos: '1000' })).toThrow();
    expect(liquidarRenta(2026, 'GENERAL', 'SOCIEDAD', { ingresosBrutos: '1000', tarifaSociedad: '25', fundamentoTarifa: 'Tarifa confirmada' }).impuestoCausado).toBe('250.00');
  });
});
