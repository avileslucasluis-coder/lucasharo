import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const money = (value: Prisma.Decimal.Value = 0) => new Prisma.Decimal(value);
export const amount = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
const positive = (value: Prisma.Decimal) => Prisma.Decimal.max(0, value);
export type Values = Record<string, string>;

export function liquidarIva(ventas: Prisma.Decimal, compras: Prisma.Decimal, retenido: Prisma.Decimal, emitido: Prisma.Decimal, inputs: Values = {}) {
  const n = (key: string) => money(inputs[key] ?? 0);
  const factor = money(inputs.factorCredito ?? 1);
  if (factor.lt(0) || factor.gt(1)) throw new BadRequestException('El factor de crédito debe estar entre 0 y 1.');
  if (n('ivaSinDerechoCredito').gt(positive(compras))) throw new BadRequestException('El IVA sin derecho a crédito supera el IVA de compras.');
  const creditoCompras = money(amount(compras.minus(n('ivaSinDerechoCredito')).times(factor)));
  const saldoCompras = creditoCompras.plus(n('creditoAnteriorCompras')).minus(n('ajusteCreditoCompras'));
  const saldoRetenciones = retenido.plus(n('creditoAnteriorRetenciones')).minus(n('ajusteCreditoRetenciones'));
  const impuestoAntesRetenciones = ventas.minus(saldoCompras);
  const saldo = impuestoAntesRetenciones.minus(saldoRetenciones);
  const creditoSiguienteCompras = positive(impuestoAntesRetenciones.negated());
  const creditoSiguienteRetenciones = positive(saldoRetenciones.minus(positive(impuestoAntesRetenciones)));
  // Un ajuste negativo de retenciones consume primero el crédito disponible de compras.
  const creditoTotal = positive(saldo.negated());
  const comprasFinal = Prisma.Decimal.min(creditoSiguienteCompras, creditoTotal);
  return {
    creditoAnteriorCompras: amount(n('creditoAnteriorCompras')),
    creditoAnteriorRetenciones: amount(n('creditoAnteriorRetenciones')),
    ivaComprasConDerechoCredito: amount(creditoCompras),
    ivaAPagar104: amount(positive(saldo)),
    creditoSiguienteCompras: amount(comprasFinal),
    creditoSiguienteRetenciones: amount(Prisma.Decimal.min(creditoSiguienteRetenciones, positive(creditoTotal.minus(comprasFinal)))),
    creditoTributarioSiguientePeriodo: amount(creditoTotal),
    totalAPagar104: amount(positive(saldo).plus(emitido).plus(n('multa104')).plus(n('interes104'))),
    multa104: amount(n('multa104')), interes104: amount(n('interes104')),
  };
}

// SRI: Tablas de cálculo de Impuesto a la Renta, resolución NAC-DGERCGC25-00000043.
// Cada fila contiene límite inferior, impuesto de fracción básica y porcentaje excedente.
const tablas: Record<number, number[][]> = {
  2025: [[0,0,0],[12081,0,5],[15387,165,10],[19978,624,12],[26422,1398,15],[34770,2650,20],[46089,4914,25],[61359,8731,30],[81817,14869,35],[108810,24316,37]],
  2026: [[0,0,0],[12208,0,5],[15549,167,10],[20188,631,12],[26700,1412,15],[35136,2678,20],[46575,4965,25],[62005,8823,30],[82679,15025,35],[109956,24572,37]],
};
export const RENT_SOURCE = 'https://www.sri.gob.ec/impuesto-renta';
export const RIMPE_SOURCE = 'https://www.sri.gob.ec/rimpe';
export function liquidarRenta(year: number, regimen: string, tipoPersona: string | null, inputs: Values) {
  if (!tablas[year]) throw new BadRequestException('Las tablas verificadas corresponden a 2025 y 2026. No se aplicará una tabla de otro ejercicio.');
  if (!['NATURAL', 'SOCIEDAD'].includes(tipoPersona ?? '')) throw new BadRequestException('Completa el tipo de persona en el perfil tributario.');
  const n = (key: string) => money(inputs[key] ?? 0);
  const ingresos = n('ingresosBrutos').minus(n('devolucionesDescuentos')).minus(n('ingresosExentos'));
  if (ingresos.lt(0)) throw new BadRequestException('Las devoluciones y exenciones superan los ingresos.');
  let base = ingresos, impuesto = money(0), source = RENT_SOURCE;
  if (regimen.startsWith('RIMPE')) {
    source = RIMPE_SOURCE;
    if (ingresos.gt(regimen === 'RIMPE_NEGOCIO_POPULAR' ? 20000 : 300000)) throw new BadRequestException('Los ingresos exceden el rango del régimen seleccionado. Revisa el régimen antes de liquidar.');
    if (['gastosDeducibles', 'ajustesAumentan', 'ajustesDisminuyen', 'rebajaGastosPersonales', 'tarifaSociedad'].some(k => n(k).gt(0)))
      throw new BadRequestException('No se aplican gastos, rebaja personal ni tarifa societaria general a la base RIMPE. Los ingresos excluidos requieren una liquidación separada.');
    if (regimen === 'RIMPE_NEGOCIO_POPULAR' && tipoPersona !== 'NATURAL') throw new BadRequestException('Negocio Popular requiere persona natural.');
    if (ingresos.lte(20000)) {
      if (tipoPersona === 'SOCIEDAD') throw new BadRequestException('Revisa el tratamiento de sociedades RIMPE con ingresos hasta USD 20.000 con tu contador.');
      impuesto = money(ingresos.lte(2500) ? 0 : ingresos.lte(5000) ? 5 : ingresos.lte(10000) ? 15 : ingresos.lte(15000) ? 35 : 60);
    } else {
      const rows = [[20000,60,1],[50000,360,1.25],[75000,672.50,1.5],[100000,1047.50,1.75],[200000,2797.52,2]];
      const row = [...rows].reverse().find(r => ingresos.gt(r[0]))!;
      impuesto = money(row[1]).plus(ingresos.minus(row[0]).times(row[2]).div(100));
    }
  } else if (regimen === 'GENERAL') {
    base = positive(ingresos.minus(n('gastosDeducibles')).plus(n('ajustesAumentan')).minus(n('ajustesDisminuyen')));
    if (tipoPersona === 'SOCIEDAD') {
      if (!inputs.tarifaSociedad || !inputs.fundamentoTarifa?.trim()) throw new BadRequestException('Confirma la tarifa de la sociedad y su fundamento legal; no se presume una tarifa universal.');
      if (n('tarifaSociedad').gt(35)) throw new BadRequestException('Tarifa societaria fuera del rango admitido para revisión.');
      if (n('rebajaGastosPersonales').gt(0)) throw new BadRequestException('La rebaja por gastos personales no aplica a sociedades.');
      impuesto = base.times(n('tarifaSociedad')).div(100);
    } else {
      const row = [...tablas[year]].reverse().find(r => base.gt(r[0])) ?? tablas[year][0];
      impuesto = money(row[1]).plus(base.minus(row[0]).times(row[2]).div(100));
    }
  } else throw new BadRequestException('Régimen no soportado.');
  impuesto = money(amount(impuesto));
  const rebaja = Prisma.Decimal.min(impuesto, n('rebajaGastosPersonales'));
  const saldo = impuesto.minus(rebaja).minus(n('retencionesRenta')).minus(n('creditoAnteriorRenta')).minus(n('anticiposRenta'));
  return { ejercicio: year, regimen, tipoPersona, baseImponible: amount(base), impuestoCausado: amount(impuesto),
    rebajaAplicada: amount(rebaja), impuestoRentaAPagar: amount(positive(saldo)), saldoFavorRenta: amount(positive(saldo.negated())),
    totalRentaAPagar: amount(positive(saldo).plus(n('multaRenta')).plus(n('interesRenta'))),
    fuente: source, versionReglas: 'IR-2025-2026-revision-2026-10-31',
    alcance: 'LIQUIDACION_CON_DATOS_CONCILIADOS',
  };
}
