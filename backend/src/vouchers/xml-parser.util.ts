import { Prisma } from '@prisma/client';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

export class XmlComprobanteException extends Error {}

export interface ComprobanteParseado {
  tipoComprobante: 'FACTURA' | 'NOTA_CREDITO' | 'RETENCION' | 'LIQUIDACION';
  claveAcceso: string;
  rucEmisor: string;
  razonSocialEmisor: string;
  fechaEmision: Date;
  baseImponibleIva: number;
  baseImponibleIva0: number;
  montoIva: number;
  montoRentaRetenida: number;
  importeTotal: number;
  identificacionContraparte: string;
  razonSocialContraparte: string;
  direccion: 'VENTA' | 'COMPRA' | 'RETENCION_RECIBIDA' | 'RETENCION_EMITIDA' | 'NO_RELACIONADO';
}

const parser = new XMLParser({ ignoreAttributes: false, trimValues: true, parseTagValue: false });

/// Parser de comprobantes electrónicos del SRI. Es el mismo diseño que ya
/// se implementó y probó en la app Flutter (xml_parser_service.dart),
/// portado a Node para que el backend pueda procesar comprobantes subidos
/// por el frontend o recibidos por otro medio, sin duplicar la lógica de
/// clasificación compra/venta.
export function parseComprobanteXml(xmlContent: string, contribuyenteRuc: string): ComprobanteParseado {
  if (/<!DOCTYPE|<!ENTITY/i.test(xmlContent) || XMLValidator.validate(xmlContent) !== true) {
    throw new XmlComprobanteException('El archivo no es un XML válido.');
  }
  let doc: any;
  try {
    doc = parser.parse(xmlContent);
  } catch (e) {
    throw new XmlComprobanteException(`El archivo no es un XML válido: ${e}`);
  }

  // Si es un XML de autorización del SRI, el comprobante real viene
  // escapado como texto dentro de <comprobante>.
  if (doc.autorizacion?.comprobante) {
    if (doc.autorizacion.estado && doc.autorizacion.estado !== 'AUTORIZADO') {
      throw new XmlComprobanteException('El archivo contiene un comprobante no autorizado.');
    }
    try {
      if (/<!DOCTYPE|<!ENTITY/i.test(doc.autorizacion.comprobante) || XMLValidator.validate(doc.autorizacion.comprobante) !== true) {
        throw new Error('XML interno inválido.');
      }
      doc = parser.parse(doc.autorizacion.comprobante);
    } catch (e) {
      throw new XmlComprobanteException(`No se pudo interpretar el comprobante interno: ${e}`);
    }
  }

  const raiz = Object.keys(doc).find((k) => k !== '?xml');
  if (!raiz) throw new XmlComprobanteException('XML sin elemento raíz reconocible.');
  const nodo = doc[raiz];

  const tipo = detectarTipo(raiz);

  let baseIva = new Prisma.Decimal(0);
  let base0 = new Prisma.Decimal(0);
  let montoIva = new Prisma.Decimal(0);
  let montoRenta = new Prisma.Decimal(0);
  let total = new Prisma.Decimal(0);
  let identificacionContraparte = '';
  let razonSocialContraparte = '';

  const claveAcceso = nodo.claveAcceso ?? nodo.infoTributaria?.claveAcceso ?? '';
  const rucEmisor = nodo.infoTributaria?.ruc ?? '';
  const razonSocial = nodo.infoTributaria?.razonSocial ?? nodo.infoTributaria?.nombreComercial ?? 'Emisor no identificado';

  if (tipo === 'FACTURA' || tipo === 'NOTA_CREDITO' || tipo === 'LIQUIDACION') {
    const infoKey = tipo === 'FACTURA' ? 'infoFactura' : tipo === 'NOTA_CREDITO' ? 'infoNotaCredito' : 'infoLiquidacionCompra';
    const totalesImpuesto = normalizarLista(nodo[infoKey]?.totalConImpuestos?.totalImpuesto);
    for (const imp of totalesImpuesto) {
      if (String(imp.codigo) !== '2') continue;
      const base = importeDecimal(imp.baseImponible);
      const valor = importeDecimal(imp.valor);
      if (valor.isZero()) base0 = base0.plus(base);
      else {
        baseIva = baseIva.plus(base);
        montoIva = montoIva.plus(valor);
      }
    }
    total = importeDecimal(nodo[infoKey]?.importeTotal ?? nodo[infoKey]?.valorModificacion ?? baseIva.plus(base0).plus(montoIva).toFixed(2));
    identificacionContraparte = String(nodo[infoKey]?.identificacionComprador ?? nodo[infoKey]?.identificacionProveedor ?? '');
    razonSocialContraparte = String(nodo[infoKey]?.razonSocialComprador ?? nodo[infoKey]?.razonSocialProveedor ?? '');
  } else if (tipo === 'RETENCION') {
    const impuestos = [
      ...normalizarLista(nodo.impuestos?.impuesto),
      ...normalizarLista(nodo.docsSustento?.docSustento).flatMap((doc: any) => normalizarLista(doc.retenciones?.retencion)),
    ];
    for (const imp of impuestos) {
      const base = importeDecimal(imp.baseImponible);
      const valor = importeDecimal(imp.valorRetenido);
      if (String(imp.codigo) === '1') montoRenta = montoRenta.plus(valor);
      else if (String(imp.codigo) === '2') {
        baseIva = baseIva.plus(base);
        montoIva = montoIva.plus(valor);
      }
    }
    total = montoIva.plus(montoRenta);
    identificacionContraparte = String(nodo.infoCompRetencion?.identificacionSujetoRetenido ?? '');
    razonSocialContraparte = String(nodo.infoCompRetencion?.razonSocialSujetoRetenido ?? '');
  }

  if (!claveAcceso || !rucEmisor) {
    throw new XmlComprobanteException(
      'El XML no contiene los campos mínimos de un comprobante SRI (claveAcceso / RUC emisor).',
    );
  }

  const fechaStr =
    nodo.infoFactura?.fechaEmision ?? nodo.infoCompRetencion?.fechaEmision ?? nodo.infoNotaCredito?.fechaEmision ?? nodo.infoLiquidacionCompra?.fechaEmision ?? '';
  const fechaEmision = parsearFechaSri(fechaStr);

  if (![baseIva, base0, montoIva, montoRenta, total].every((valor) => valor.isFinite() && valor.gte(0) && valor.lte("9999999999.99"))) {
    throw new XmlComprobanteException('El XML contiene importes inválidos.');
  }

  const direccion = clasificarDireccion(tipo, rucEmisor, identificacionContraparte, contribuyenteRuc);

  return {
    tipoComprobante: tipo,
    claveAcceso,
    rucEmisor,
    razonSocialEmisor: razonSocial,
    fechaEmision,
    baseImponibleIva: baseIva.toNumber(),
    baseImponibleIva0: base0.toNumber(),
    montoIva: montoIva.toNumber(),
    montoRentaRetenida: montoRenta.toNumber(),
    importeTotal: total.toNumber(),
    identificacionContraparte,
    razonSocialContraparte,
    direccion,
  };
}

function importeDecimal(raw: unknown): Prisma.Decimal {
  const text = String(raw ?? '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new XmlComprobanteException('Importe inválido: se requiere un decimal no negativo con máximo dos decimales.');
  }
  const value = new Prisma.Decimal(text);
  if (value.gt('9999999999.99')) throw new XmlComprobanteException('El importe excede la capacidad monetaria del sistema.');
  return value;
}

function detectarTipo(raiz: string): ComprobanteParseado['tipoComprobante'] {
  switch (raiz) {
    case 'factura':
      return 'FACTURA';
    case 'notaCredito':
      return 'NOTA_CREDITO';
    case 'comprobanteRetencion':
      return 'RETENCION';
    case 'liquidacionCompra':
      return 'LIQUIDACION';
    default:
      throw new XmlComprobanteException(`Tipo de comprobante no soportado: <${raiz}>.`);
  }
}

function clasificarDireccion(
  tipo: ComprobanteParseado['tipoComprobante'],
  rucEmisor: string,
  identificacionContraparte: string,
  contribuyenteRuc: string,
): ComprobanteParseado['direccion'] {
  const ruc = contribuyenteRuc.trim();

  if (tipo === 'RETENCION') {
    if (identificacionContraparte.trim() === ruc) return 'RETENCION_RECIBIDA';
    if (rucEmisor.trim() === ruc) return 'RETENCION_EMITIDA';
    return 'NO_RELACIONADO';
  }
  if (tipo === 'LIQUIDACION') {
    if (rucEmisor.trim() === ruc) return 'COMPRA';
    if (identificacionContraparte.trim() === ruc) return 'VENTA';
    return 'NO_RELACIONADO';
  }
  if (rucEmisor.trim() === ruc) return 'VENTA';
  if (identificacionContraparte.trim() === ruc) return 'COMPRA';
  return 'NO_RELACIONADO';
}

function parsearFechaSri(raw: string): Date {
  if (!raw) throw new XmlComprobanteException('El comprobante no tiene fecha de emisión.');
  const partes = raw.split('/');
  if (partes.length === 3) {
    const [d, m, y] = partes.map(Number);
    const fecha = new Date(y, m - 1, d);
    if (fecha.getFullYear() === y && fecha.getMonth() === m - 1 && fecha.getDate() === d) return fecha;
    throw new XmlComprobanteException(`Fecha de emisión inválida: ${raw}.`);
  }
  const intento = new Date(raw);
  if (isNaN(intento.getTime())) throw new XmlComprobanteException(`Fecha de emisión inválida: ${raw}.`);
  return intento;
}

function normalizarLista<T>(valor: T | T[] | undefined): T[] {
  if (valor === undefined) return [];
  return Array.isArray(valor) ? valor : [valor];
}
