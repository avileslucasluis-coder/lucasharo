import { Prisma } from '@prisma/client';
import { TaxLine } from './tax-detail';
import { sameTaxpayer } from './taxpayer-identity';

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export function moneyTxt(raw: string): number {
  let s = raw.trim().replace(/\$/g, '').replace(/\s/g, '');
  if (s.includes(',')) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(s)) throw new Error(`Importe inválido: ${raw}`);
    s = s.replace(/\./g, '').replace(',', '.');
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(s)) throw new Error(`Importe inválido: ${raw}`);
  const n = new Prisma.Decimal(s);
  if (n.gt('9999999999.99')) throw new Error('Importe fuera de rango.');
  return n.toNumber();
}

function cells(line: string, delimiter: string): string[] {
  const out: string[] = []; let s = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (quoted && line[i + 1] === '"') { s += '"'; i++; } else quoted = !quoted; }
    else if (c === delimiter && !quoted) { out.push(s.trim()); s = ''; } else s += c;
  }
  if (quoted) throw new Error('Comillas sin cerrar.');
  return [...out, s.trim()];
}

export function parseSriTxt(content: string, companyRuc: string, sentido: 'RECIBIDOS' | 'EMITIDOS') {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2 || lines.length > 10001) throw new Error('El TXT debe contener encabezado y entre 1 y 10000 filas.');
  const delimiter = lines[0].includes('\t') ? '\t' : ';';
  const headers = cells(lines[0], delimiter).map(normalize);
  const records = new Map<string, any>();
  for (let i = 1; i < lines.length; i++) {
    try {
      const values = cells(lines[i], delimiter);
      if (values.length !== headers.length) throw new Error('Cantidad de columnas diferente del encabezado.');
      const row = Object.fromEntries(headers.map((h, j) => [h, values[j]]));
      const get = (...keys: string[]) => keys.map(k => row[normalize(k)]).find(v => v !== undefined && v !== '') ?? '';
      const clave = get('CLAVE_ACCESO', 'CLAVE DE ACCESO', 'NUMERO_AUTORIZACION', 'AUTORIZACION');
      if (!/^\d{49}$/.test(clave)) throw new Error('Se requiere la clave de acceso de 49 dígitos.');
      const emitter = get('RUC_EMISOR', 'RUC');
      if (!/^(?:\d{10}|\d{13})$/.test(emitter)) throw new Error('RUC o cédula del emisor inválido.');
      let counterpart = get('IDENTIFICACION_RECEPTOR', 'IDENTIFICACION_COMPRADOR', 'IDENTIFICACION_SUJETO_RETENIDO');
      if (!counterpart && sentido === 'RECIBIDOS') counterpart = companyRuc;
      if (sentido === 'EMITIDOS' && !sameTaxpayer(emitter, companyRuc) || sentido === 'RECIBIDOS' && !sameTaxpayer(counterpart, companyRuc)) throw new Error('El comprobante no pertenece a la empresa seleccionada.');
      const date = get('FECHA_EMISION', 'FECHA DE EMISION').split('/').map(Number);
      const fecha = new Date(Date.UTC(date[2], date[1] - 1, date[0]));
      if (date.length !== 3 || fecha.getUTCFullYear() !== date[2] || fecha.getUTCMonth() !== date[1] - 1 || fecha.getUTCDate() !== date[0]) throw new Error('Fecha inválida; usa dd/MM/aaaa.');
      const type = normalize(get('TIPO_COMPROBANTE', 'TIPO DE COMPROBANTE', 'COMPROBANTE') || clave.slice(8, 10));
      const tipo = ['07', '7', 'RETENCION', 'COMPROBANTEDERETENCION'].includes(type) ? 'RETENCION' : ['04', '4', 'NOTADECREDITO', 'NOTACREDITO'].includes(type) ? 'NOTA_CREDITO' : ['01', '1', 'FACTURA'].includes(type) ? 'FACTURA' : '';
      if (!tipo) throw new Error('Tipo de comprobante no admitido en TXT.');
      const taxes: TaxLine[] = [];
      const rate = get('TARIFA_IVA', 'PORCENTAJE_IVA').replace('%', '').trim();
      if (tipo !== 'RETENCION' && rate !== '') {
        const tarifa = normalize(rate) === 'NOOBJETO' || normalize(rate) === 'NOOBJETODEIVA' ? 'NO_OBJETO' : rate;
        if (!['0', '5', '8', '15', 'NO_OBJETO', '12', '14', '13', 'EXENTO'].includes(tarifa)) throw new Error('Tarifa IVA no reconocida.');
        const base = moneyTxt(get('BASE_IMPONIBLE', 'VALOR_SIN_IMPUESTOS'));
        const valor = moneyTxt(get('IVA', 'VALOR_IVA'));
        if (Math.abs(new Prisma.Decimal(base).times(Number(tarifa) || 0).div(100).toDecimalPlaces(2).toNumber() - valor) > 0.01) throw new Error('El IVA no coincide con base y tarifa.');
        taxes.push({ grupo: 'IVA', tarifa, base, valor });
      }
      if (tipo === 'RETENCION') {
        const group = normalize(get('IMPUESTO', 'TIPO_IMPUESTO'));
        if (group) {
          const grupo = ['IVA', '2'].includes(group) ? 'RET_IVA' : ['RENTA', 'FUENTE', '1'].includes(group) ? 'RENTA' : '';
          const tarifa = get('PORCENTAJE_RETENCION', 'PORCENTAJE_RETENER').replace('%', '').trim();
          if (!grupo || !(grupo === 'RET_IVA' ? ['30', '70', '100', '0', '10', '20', '50'] : ['15', '10', '5', '3', '2', '1', '0']).includes(tarifa)) throw new Error('Impuesto o porcentaje de retención inválido.');
          const base = moneyTxt(get('BASE_IMPONIBLE'));
          const valor = moneyTxt(get('VALOR_RETENIDO'));
          if (Math.abs(new Prisma.Decimal(base).times(tarifa).div(100).toDecimalPlaces(2).toNumber() - valor) > 0.01) throw new Error('La retención no coincide con su base y porcentaje.');
          taxes.push({ grupo, tarifa, base, valor, codigo: get('CODIGO_RETENCION') });
        }
      }
      const existing = records.get(clave);
      if (existing) {
        if (!taxes.length || existing.clasificacionPendiente || existing.rucEmisor !== emitter || existing.fechaEmision.getTime() !== fecha.getTime() || existing.tipoComprobante !== tipo || existing.identificacionContraparte !== counterpart) throw new Error('Clave repetida con datos incompatibles.');
        if (taxes.some(l => existing.detalleImpuestos.some((e: TaxLine) => JSON.stringify(e) === JSON.stringify(l)))) throw new Error('Línea de impuesto duplicada para la misma clave.');
        existing.detalleImpuestos.push(...taxes);
      } else records.set(clave, {
        tipoComprobante: tipo, claveAcceso: clave, rucEmisor: emitter,
        razonSocialEmisor: get('RAZON_SOCIAL_EMISOR', 'RAZON_SOCIAL') || emitter,
        identificacionContraparte: counterpart, razonSocialContraparte: get('RAZON_SOCIAL_RECEPTOR'), fechaEmision: fecha,
        direccion: tipo === 'RETENCION' ? sentido === 'RECIBIDOS' ? 'RETENCION_RECIBIDA' : 'RETENCION_EMITIDA' : sentido === 'RECIBIDOS' ? 'COMPRA' : 'VENTA',
        detalleImpuestos: taxes, clasificacionPendiente: !taxes.length, fuente: 'TXT',
        importeTotal: get('IMPORTE_TOTAL', 'VALOR_TOTAL') ? moneyTxt(get('IMPORTE_TOTAL', 'VALOR_TOTAL')) : 0,
        baseImponibleIva: 0, baseImponibleIva0: 0, montoIva: 0, montoRentaRetenida: 0,
      });
    } catch (e) { throw new Error(`Fila ${i + 1}: ${(e as Error).message}`); }
  }
  for (const v of records.values()) {
    const sum = (predicate: (l: TaxLine) => boolean, field: 'base' | 'valor') => v.detalleImpuestos.filter(predicate).reduce((s: Prisma.Decimal, l: TaxLine) => s.plus(l[field]), new Prisma.Decimal(0)).toNumber();
    v.baseImponibleIva = sum(l => l.grupo === 'IVA' && Number(l.tarifa) > 0 || l.grupo === 'RET_IVA', 'base');
    v.baseImponibleIva0 = sum(l => l.grupo === 'IVA' && !(Number(l.tarifa) > 0), 'base');
    v.montoIva = sum(l => ['IVA', 'RET_IVA'].includes(l.grupo), 'valor');
    v.montoRentaRetenida = sum(l => l.grupo === 'RENTA', 'valor');
    if (!v.clasificacionPendiente) v.importeTotal = new Prisma.Decimal(v.montoIva).plus(v.montoRentaRetenida).plus(v.tipoComprobante === 'RETENCION' ? 0 : new Prisma.Decimal(v.baseImponibleIva).plus(v.baseImponibleIva0)).toNumber();
  }
  return [...records.values()];
}
