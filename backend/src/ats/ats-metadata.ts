import { XMLParser, XMLValidator } from 'fast-xml-parser';

/** Conserva datos de la fuente sin inferir formas de pago ni relaciones. */
export function metadataAts(xml?: string | null): { pagos: string[]; tipoIdentificacion?: string; parteRelacionada?: string } {
  if (!xml) return { pagos: [] };
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) return { pagos: [] };
  const parser = new XMLParser({ parseTagValue: false, ignoreAttributes: false });
  let doc = parser.parse(xml);
  if (typeof doc.autorizacion?.comprobante === 'string') {
    const interno = doc.autorizacion.comprobante;
    if (/<!DOCTYPE|<!ENTITY/i.test(interno) || XMLValidator.validate(interno) !== true) return { pagos: [] };
    doc = parser.parse(interno);
  }
  const info = doc.factura?.infoFactura ?? doc.notaCredito?.infoNotaCredito ?? doc.liquidacionCompra?.infoLiquidacionCompra;
  const pagos = info?.pagos?.pago;
  return {
    pagos: [...new Set<string>((pagos ? Array.isArray(pagos) ? pagos : [pagos] : []).map((p: any) => String(p.formaPago)).filter((p: string) => /^\d{2}$/.test(p)))].sort(),
    tipoIdentificacion: info?.tipoIdentificacionComprador ?? info?.tipoIdentificacionProveedor,
    parteRelacionada: ['SI', 'NO'].includes(info?.parteRel) ? info.parteRel : undefined,
  };
}

export function tipoIdentificacionAts(id: string, venta: boolean, tipoOriginal?: string): string {
  if (venta) {
    if (id === '9999999999999') return '07';
    if (tipoOriginal && ['04', '05', '06', '07'].includes(tipoOriginal)) return tipoOriginal;
    return /^\d{13}$/.test(id) ? '04' : /^\d{10}$/.test(id) ? '05' : '06';
  }
  if (tipoOriginal && ['04', '05', '06'].includes(tipoOriginal)) return ({ '04': '01', '05': '02', '06': '03' } as Record<string, string>)[tipoOriginal];
  return /^\d{13}$/.test(id) ? '01' : /^\d{10}$/.test(id) ? '02' : '03';
}
