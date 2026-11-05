import { XMLParser, XMLValidator } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: true });
const lista = (value: any): any[] => value == null ? [] : Array.isArray(value) ? value : [value];
const texto = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const numero = (value: unknown): number => {
  const result = Number(value ?? 0);
  return Number.isFinite(result) && result >= 0 ? result : NaN;
};

export interface RetencionFuente {
  numeroDocumento: string;
  codigoDocumento: string;
  autorizacionDocumento: string;
  codSustento: string;
  parteRelacionada: string;
  pagos: string[];
  impuestos: { codigo: string; codigoRetencion: string; base: number; porcentaje: number; valor: number }[];
}

export interface FuenteAts {
  disponible: boolean;
  estadoAutorizacion: string;
  tipoIdentificacion: string;
  pagos: string[];
  base0?: number;
  baseGravada?: number;
  baseNoObjeto?: number;
  baseExenta?: number;
  montoIce?: number;
  codigoModificado: string;
  numeroModificado: string;
  retenciones: RetencionFuente[];
}

/** Conserva las referencias y los impuestos del XML: nunca infiere pagos o porcentajes. */
export function leerFuenteAts(xml: string | null | undefined): FuenteAts {
  const vacio: FuenteAts = {
    disponible: false, estadoAutorizacion: '', tipoIdentificacion: '', pagos: [],
    codigoModificado: '', numeroModificado: '', retenciones: [],
  };
  if (!xml || XMLValidator.validate(xml) !== true || /<!DOCTYPE|<!ENTITY/i.test(xml)) return vacio;
  try {
    let doc = parser.parse(xml);
    let estadoAutorizacion = '';
    if (doc.autorizacion) {
      estadoAutorizacion = texto(doc.autorizacion.estado);
      if (typeof doc.autorizacion.comprobante !== 'string' || /<!DOCTYPE|<!ENTITY/i.test(doc.autorizacion.comprobante) || XMLValidator.validate(doc.autorizacion.comprobante) !== true) return vacio;
      doc = parser.parse(doc.autorizacion.comprobante);
    }
    const nodo = doc.factura ?? doc.notaCredito ?? doc.liquidacionCompra ?? doc.comprobanteRetencion;
    if (!nodo) return vacio;
    const info = nodo.infoFactura ?? nodo.infoNotaCredito ?? nodo.infoLiquidacionCompra;
    const pagos = (n: any) => [...new Set<string>(lista(n?.pagos?.pago).map(p => texto(p.formaPago ?? p.formapago)).filter(Boolean))];
    const result: FuenteAts = {
      ...vacio, disponible: true, estadoAutorizacion,
      tipoIdentificacion: texto(info?.tipoIdentificacionComprador ?? info?.tipoIdentificacionProveedor),
      pagos: pagos(info), codigoModificado: texto(info?.codDocModificado),
      numeroModificado: normalizarNumeroDocumento(texto(info?.numDocModificado)),
    };
    if (info?.totalConImpuestos) {
      result.base0 = 0; result.baseGravada = 0; result.baseNoObjeto = 0; result.baseExenta = 0; result.montoIce = 0;
      for (const impuesto of lista(info.totalConImpuestos.totalImpuesto)) {
        if (texto(impuesto.codigo) === '3') { result.montoIce += numero(impuesto.valor); continue; }
        if (texto(impuesto.codigo) !== '2') continue;
        const base = numero(impuesto.baseImponible);
        switch (texto(impuesto.codigoPorcentaje)) {
          case '0': result.base0 += base; break;
          case '6': result.baseNoObjeto += base; break;
          case '7': result.baseExenta += base; break;
          default: if (numero(impuesto.valor) > 0) result.baseGravada += base; else result.base0 += base;
        }
      }
    }
    const convertir = (impuesto: any) => ({
      codigo: texto(impuesto.codigo), codigoRetencion: texto(impuesto.codigoRetencion),
      base: numero(impuesto.baseImponible), porcentaje: numero(impuesto.porcentajeRetener), valor: numero(impuesto.valorRetenido),
    });
    result.retenciones = lista(nodo.docsSustento?.docSustento).map(d => ({
      numeroDocumento: normalizarNumeroDocumento(texto(d.numDocSustento)), codigoDocumento: texto(d.codDocSustento),
      autorizacionDocumento: texto(d.numAutDocSustento), codSustento: texto(d.codSustento),
      parteRelacionada: texto(nodo.infoCompRetencion?.parteRel), pagos: pagos(d),
      impuestos: lista(d.retenciones?.retencion).map(convertir),
    }));
    // En la versión 1.0 cada impuesto lleva su documento de sustento.
    for (const imp of lista(nodo.impuestos?.impuesto)) {
      const numeroDocumento = normalizarNumeroDocumento(texto(imp.numDocSustento));
      const codigoDocumento = texto(imp.codDocSustento);
      let soporte = result.retenciones.find(d => d.numeroDocumento === numeroDocumento && d.codigoDocumento === codigoDocumento);
      if (!soporte) {
        soporte = { numeroDocumento, codigoDocumento, autorizacionDocumento: '', codSustento: '', parteRelacionada: '', pagos: [], impuestos: [] };
        result.retenciones.push(soporte);
      }
      soporte.impuestos.push(convertir(imp));
    }
    return result;
  } catch { return vacio; }
}

export function normalizarNumeroDocumento(value: string): string {
  return value.replace(/-/g, '');
}

export function codigoDocumentoSri(tipo: string): string {
  return ({ FACTURA: '01', NOTA_CREDITO: '04', LIQUIDACION: '03' } as Record<string, string>)[tipo] ?? '';
}

export function tipoIdentificacionAts(id: string, venta: boolean, codigoXml = ''): string {
  if (venta && (id === '9999999999999' || codigoXml === '07')) return '07';
  if (codigoXml === '06' || codigoXml === '08') return venta ? '06' : '03';
  if (codigoXml === '05' || /^\d{10}$/.test(id)) return venta ? '05' : '02';
  if (codigoXml === '04' || /^\d{13}$/.test(id)) return venta ? '04' : '01';
  return venta ? '06' : '03';
}
