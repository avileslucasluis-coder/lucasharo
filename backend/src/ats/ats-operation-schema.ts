import { readFileSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';
import { BadRequestException } from '@nestjs/common';
import { create } from 'xmlbuilder2';
import { Prisma } from '@prisma/client';
import { validarXsd } from './ats-xsd';

export const operationTypes: Record<string, { label: string; section: string; element: string; type: string }> = {
  IMPORTACION: { label:'Compra al exterior con comprobante 15', section:'compras', element:'detalleCompras', type:'detalleComprasType' },
  COMPRA_ESPECIAL: { label:'Compra especial, documento físico o pago al exterior', section:'compras', element:'detalleCompras', type:'detalleComprasType' },
  REEMBOLSO: { label:'Reembolso de gastos', section:'compras', element:'detalleCompras', type:'detalleComprasType' },
  EXPORTACION: { label:'Exportación / ingreso del exterior', section:'exportaciones', element:'detalleExportaciones', type:'detalleExportacionesType' },
  ANULADO: { label:'Comprobantes anulados', section:'anulados', element:'detalleAnulados', type:'detalleAnuladosType' },
  RECAP: { label:'RECAP (operadoras de tarjetas)', section:'recap', element:'detalleRecap', type:'detalleRecapType' },
  FIDEICOMISO: { label:'Fideicomisos', section:'fideicomisos', element:'detalleFideicomisos', type:'detalleFideicomisosType' },
  RENDIMIENTO: { label:'Rendimientos financieros', section:'rendFinancieros', element:'detalleRendFinancieros', type:'detalleRendFinancierosType' },
};
export interface AtsField { name: string; type: string; required: boolean; repeated: boolean; children?: AtsField[]; choices?: string[]; }
const list = (x: any): any[] => x == null ? [] : Array.isArray(x) ? x : [x];
const xsd = new XMLParser({ ignoreAttributes:false, parseAttributeValue:false }).parse(readFileSync(join(__dirname,'../../resources/ats.xsd'),'utf8'))['xsd:schema'];
const complex = new Map(list(xsd['xsd:complexType']).map(t => [t['@_name'],t]));
const simple = new Map(list(xsd['xsd:simpleType']).map(t => [t['@_name'],t]));
function fields(type: string, depth = 0, inline?: any): AtsField[] {
  if (depth > 12) throw new Error('Estructura XSD demasiado profunda.');
  const t: any = inline ?? complex.get(type);
  if (!t) throw new Error('Tipo XSD no disponible: ' + type);
  const extension = t['xsd:complexContent']?.['xsd:extension'];
  const inherited = extension ? fields(extension['@_base'], depth + 1) : [];
  return [...inherited, ...list((extension ?? t)['xsd:sequence']?.['xsd:element']).map(e => {
    const name = e['@_name'], elementType = e['@_type'] ?? '';
    const restriction = (simple.get(elementType) as any)?.['xsd:restriction'] ?? e['xsd:simpleType']?.['xsd:restriction'];
    return { name, type:elementType, required:e['@_minOccurs'] !== '0', repeated:e['@_maxOccurs'] === 'unbounded' || Number(e['@_maxOccurs'] ?? 1) > 1,
      ...(complex.has(elementType) || e['xsd:complexType'] ? { children:fields(elementType,depth+1,e['xsd:complexType']) } : {}),
      ...(restriction?.['xsd:enumeration'] ? { choices:list(restriction['xsd:enumeration']).map(v => String(v['@_value'])) } : {}) };
  })];
}
export function operationSchema(kind: string) {
  const config = operationTypes[kind];
  if (!config) throw new BadRequestException('Tipo de operación ATS inválido.');
  return { ...config, kind, fields:fields(config.type) };
}
export function appendFields(node: any, schema: AtsField[], data: Record<string,any>) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new BadRequestException('Se requiere un registro de campos ATS.');
  const allowed = new Set(schema.map(f => f.name));
  for (const key of Object.keys(data)) if (!allowed.has(key)) throw new BadRequestException('Campo ATS desconocido: ' + key);
  for (const f of schema) {
    const value = data[f.name];
    if (value === undefined || value === '') { if (f.required) throw new BadRequestException('Falta el campo ' + f.name); continue; }
    const values = f.repeated ? value : [value];
    if (!Array.isArray(values) || values.length > 100 || (f.required && values.length === 0)) throw new BadRequestException('Lista inválida: ' + f.name);
    for (const item of values) {
      const child = node.ele(f.name);
      if (f.children) appendFields(child, f.children, item);
      else {
        if (typeof item !== 'string' || !item.trim() || item.length > 1000) throw new BadRequestException('Valor inválido: ' + f.name);
        if (/fecha/i.test(f.name)) parseDate(item);
        child.txt(item);
      }
    }
  }
}
function parseDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) throw new BadRequestException('Las fechas ATS deben usar DD/MM/AAAA.');
  const date = new Date(Date.UTC(+match[3],+match[2]-1,+match[1]));
  if (date.getUTCDate() !== +match[1] || date.getUTCMonth()+1 !== +match[2]) throw new BadRequestException('Fecha ATS inexistente.');
  return date;
}
const need = (data: any, keys: string[]) => { for (const key of keys) if (data?.[key] === undefined || data[key] === '') throw new BadRequestException('Falta el campo condicional ' + key); };
export async function validateOperation(kind: string, data: Record<string,any>, mes: number, anio: number) {
  const schema = operationSchema(kind);
  const doc = create().ele('iva');
  for (const [key,value] of Object.entries({ TipoIDInformante:'R', IdInformante:'0999999999001', razonSocial:'VALIDACION ESTRUCTURAL', Anio:anio, Mes:String(mes).padStart(2,'0'), numEstabRuc:'001', totalVentas:'0.00', codigoOperativo:'IVA' })) doc.ele(key).txt(String(value));
  appendFields(doc.ele(schema.section).ele(schema.element), schema.fields, data);
  try { await validarXsd(doc.end()); }
  catch (error) {
    if (error instanceof BadRequestException) {
      const response = error.getResponse() as any;
      throw new BadRequestException('Revisa los campos ATS: ' + (response.errores?.slice(0,3).join(' · ') ?? error.message));
    }
    throw error;
  }
  const periodDate = data.fechaRegistro ?? data.fechaEmbarque ?? data.fechaPago;
  if (periodDate) {
    const date = parseDate(periodDate);
    if (date.getUTCFullYear() !== anio || date.getUTCMonth()+1 !== mes) throw new BadRequestException('La fecha contable/embarque no corresponde al período ATS.');
    if (data.fechaEmision && parseDate(data.fechaEmision) > date) throw new BadRequestException('La emisión no puede ser posterior al registro.');
  }
  if (schema.section === 'compras') {
    need(data,['pagoExterior','parteRel']);
    if (data.tipoComprobante === '16') throw new BadRequestException('El comprobante 16 corresponde a exportaciones; no es una compra ni una declaración aduanera de importación.');
    if (data.tpIdProv === '03') need(data,['tipoProv','denoProv']);
    const amount = ['baseNoGraIva','baseImponible','baseImpGrav','baseImpExe','montoIce','montoIva'].reduce((sum,k) => sum.plus(data[k]),new Prisma.Decimal(0));
    if (anio >= 2024 && amount.gte(500) && !data.formasDePago?.formaPago?.length) throw new BadRequestException('Agrega la forma de pago para operaciones desde 500 dólares.');
    if (data.tipoComprobante === '04') need(data,['docModificado','estabModificado','ptoEmiModificado','secModificado','autModificado']);
    for (const n of [1,2]) {
      const keys = ['estabRetencion','ptoEmiRetencion','secRetencion','autRetencion','fechaEmiRet'].map(k => k+n);
      if (keys.some(k => data[k] !== undefined)) {
        need(data,keys);
        if (parseDate(data['fechaEmiRet'+n]) < parseDate(data.fechaRegistro)) throw new BadRequestException('La retención no puede ser anterior al registro contable.');
      }
    }
    if (kind === 'IMPORTACION' && (data.tipoComprobante !== '15' || data.pagoExterior.pagoLocExt !== '02')) throw new BadRequestException('La compra al exterior requiere comprobante 15 y pago a no residente. Para una liquidación utiliza Compra especial.');
    const payment = data.pagoExterior;
    if (payment.pagoLocExt === '02') {
      need(payment,['tipoRegi']);
      if (!['01','02','03'].includes(payment.tipoRegi)) throw new BadRequestException('Régimen fiscal del exterior inválido.');
      need(payment, payment.tipoRegi === '01' ? ['paisEfecPagoGen'] : payment.tipoRegi === '02' ? ['paisEfecPagoParFis'] : ['denopagoRegFis','paisEfecPago']);
      if (![payment.aplicConvDobTrib,payment.pagExtSujRetNorLeg].every(v => ['SI','NO'].includes(v))) throw new BadRequestException('Confirma convenio y retención legal para el pago al exterior.');
    }
    if (kind === 'REEMBOLSO' || ['41','47','48'].includes(data.tipoComprobante)) {
      if (!['41','47','48'].includes(data.tipoComprobante)) throw new BadRequestException('El reembolso requiere tipo 41, 47 o 48.');
      const items = data.reembolsos?.reembolso;
      if (!Array.isArray(items) || !items.length) throw new BadRequestException('Agrega los comprobantes del reembolso.');
      let total = new Prisma.Decimal(0);
      const documents = new Set<string>();
      for (const r of items) {
        const key = JSON.stringify([r.idProvReemb,r.tipoComprobanteReemb,r.establecimientoReemb,r.puntoEmisionReemb,r.secuencialReemb]);
        if (documents.has(key)) throw new BadRequestException('Un comprobante de reembolso está repetido.');
        documents.add(key);
        if (parseDate(r.fechaEmisionReemb) > parseDate(data.fechaRegistro)) throw new BadRequestException('Sustento del reembolso posterior al registro.');
        const base = ['baseImponibleReemb','baseImpGravReemb','baseNoGraIvaReemb','baseImpExeReemb'].reduce((sum,k) => sum.plus(r[k]), new Prisma.Decimal(0));
        if (base.lte(0)) throw new BadRequestException('Cada reembolso requiere una base positiva.');
        total = total.plus(base);
      }
      if (!total.equals(data.totbasesImpReemb ?? '-1')) throw new BadRequestException('El total de bases del reembolso no coincide con sus comprobantes.');
    } else if (data.reembolsos) throw new BadRequestException('Los detalles de reembolso requieren tipo 41, 47 o 48.');
  }
  if (kind === 'EXPORTACION') {
    need(data,['tpIdClienteEx','idClienteEx','parteRelExp','tipoRegi']);
    need(data, data.tipoRegi === '01' ? ['paisEfecPagoGen'] : data.tipoRegi === '02' ? ['paisEfecPagoParFis'] : ['denopagoRegFis','paisEfecExp']);
    if (!['01','02','03'].includes(data.exportacionDe)) throw new BadRequestException('Tipo de exportación inválido.');
    if (data.exportacionDe === '01') need(data,['distAduanero','anio','regimen','correlativo','docTransp']);
    if (data.exportacionDe === '03') {
      need(data,['tipIngExt','ingExtGravOtroPais']);
      if (data.ingExtGravOtroPais === 'SI') need(data,['impuestoOtroPais']);
    }
  }
  if (kind === 'ANULADO' && BigInt(data.secuencialFin) < BigInt(data.secuencialInicio)) throw new BadRequestException('El rango de anulados está invertido.');
}
