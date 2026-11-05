import { Prisma } from '@prisma/client';
import { XMLParser } from 'fast-xml-parser';

export interface TaxLine { grupo: string; tarifa: string; base: number; valor: number; codigo?: string }
const list = (v: any): any[] => v == null ? [] : Array.isArray(v) ? v : [v];
export function xmlTaxDetail(xml: string): TaxLine[] {
  const p = new XMLParser({ parseTagValue: false, ignoreAttributes: false });
  let d = p.parse(xml);
  if (d.autorizacion?.comprobante) d = p.parse(d.autorizacion.comprobante);
  const n = d.factura ?? d.notaCredito ?? d.liquidacionCompra ?? d.comprobanteRetencion;
  if (!n) return [];
  if (d.comprobanteRetencion) return [
    ...list(n.impuestos?.impuesto),
    ...list(n.docsSustento?.docSustento).flatMap(v => list(v.retenciones?.retencion)),
  ].filter(v => ['1', '2'].includes(String(v.codigo))).map(v => ({
    grupo: String(v.codigo) === '1' ? 'RENTA' : 'RET_IVA', tarifa: String(Number(v.porcentajeRetener)),
    codigo: String(v.codigoRetencion), base: Number(v.baseImponible), valor: Number(v.valorRetenido),
  }));
  const info = n.infoFactura ?? n.infoNotaCredito ?? n.infoLiquidacionCompra;
  const codes: Record<string, string> = { '0': '0', '2': '12', '3': '14', '4': '15', '5': '5', '6': 'NO_OBJETO', '7': 'EXENTO', '8': '8', '10': '13' };
  return list(info?.totalConImpuestos?.totalImpuesto).filter(v => String(v.codigo) === '2').map(v => ({
    grupo: 'IVA', tarifa: codes[String(v.codigoPorcentaje)] ?? 'OTROS', codigo: String(v.codigoPorcentaje),
    base: Number(v.baseImponible), valor: Number(v.valor),
  }));
}

export function taxSummary(vouchers: any[]) {
  const buckets = new Map<string, { direccion: string; grupo: string; tarifa: string; base: Prisma.Decimal; valor: Prisma.Decimal }>();
  for (const v of vouchers) {
    if (v.direccion === 'NO_RELACIONADO' || v.clasificacionPendiente) continue;
    const lines: TaxLine[] = Array.isArray(v.detalleImpuestos) ? v.detalleImpuestos : v.xmlOriginal ? xmlTaxDetail(v.xmlOriginal) : [];
    for (const line of lines) {
      const key = [v.direccion, line.grupo, line.tarifa].join(':');
      const bucket = buckets.get(key) ?? { direccion: v.direccion, grupo: line.grupo, tarifa: line.tarifa, base: new Prisma.Decimal(0), valor: new Prisma.Decimal(0) };
      const sign = v.tipoComprobante === 'NOTA_CREDITO' ? -1 : 1;
      bucket.base = bucket.base.plus(new Prisma.Decimal(line.base).times(sign));
      bucket.valor = bucket.valor.plus(new Prisma.Decimal(line.valor).times(sign));
      buckets.set(key, bucket);
    }
  }
  return [...buckets.values()].map(v => ({ ...v, base: v.base.toDecimalPlaces(2).toNumber(), valor: v.valor.toDecimalPlaces(2).toNumber(), total: v.base.plus(v.valor).toDecimalPlaces(2).toNumber() }));
}
