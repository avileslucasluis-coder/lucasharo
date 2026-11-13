import { Workbook, Worksheet } from 'exceljs';
import { Prisma } from '@prisma/client';
import { TaxLine, xmlTaxDetail } from './tax-detail';

const operations: Record<string, string> = { VENTA: 'Ventas', COMPRA: 'Compras', RETENCION_RECIBIDA: 'Retenciones recibidas', RETENCION_EMITIDA: 'Retenciones emitidas' };
const moneyFormat = '"$" #,##0.00;[Red]("$" #,##0.00);"$" 0.00';
const sum = (values: (number | string | Prisma.Decimal)[]) => values.reduce<Prisma.Decimal>((total, v) => total.plus(v), new Prisma.Decimal(0)).toDecimalPlaces(2).toNumber();
const signed = (value: Prisma.Decimal.Value, sign: number) => new Prisma.Decimal(value).times(sign).toDecimalPlaces(2).toNumber();

function sheet(book: Workbook, name: string, headers: string[], company: { ruc: string; razonSocial: string }, period: string, note: string) {
  const ws = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 5 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = headers.map(h => ({ width: /Clave/.test(h) ? 52 : /Nombre/.test(h) ? 32 : /Operación/.test(h) ? 26 : 20 }));
  ws.mergeCells(1, 1, 1, headers.length);
  ws.getCell('A1').value = `${name} · ${period}`;
  ws.getCell('A1').font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF073E6E' } };
  ws.getRow(1).height = 32;
  ws.mergeCells(2, 1, 2, headers.length);
  ws.getCell('A2').value = `${company.razonSocial} · RUC ${company.ruc} · USD`;
  ws.mergeCells(3, 1, 3, headers.length);
  ws.getCell('A3').value = note;
  ws.getCell('A3').alignment = { wrapText: true, vertical: 'middle' };
  ws.getRow(3).height = 32;
  ws.getRow(5).values = headers;
  ws.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF137E75' } };
  ws.getRow(5).height = 30;
  ws.getRow(5).alignment = { wrapText: true, vertical: 'middle' };
  ws.pageSetup.printTitlesRow = '1:5';
  return ws;
}

function finish(ws: Worksheet, monetary: number[]) {
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, ws.rowCount), column: ws.columnCount } };
  monetary.forEach(col => { ws.getColumn(col).numFmt = moneyFormat; });
  ws.eachRow((row, n) => {
    if (n < 6) return;
    row.font = { name: 'Calibri', size: 11 };
    if (n % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F5F8' } };
    row.alignment = { vertical: 'middle' };
  });
}

export async function voucherExcel(company: { ruc: string; razonSocial: string }, vouchers: any[], year: number, month?: number) {
  const book = new Workbook();
  book.creator = 'Dayanex';
  book.created = new Date();
  book.calcProperties.fullCalcOnLoad = true;
  const period = month ? `${year}-${String(month).padStart(2, '0')}` : `${year} · Anual`;
  const note = 'Fuente: comprobantes importados por fecha de emisión. Notas de crédito restan. Pendientes excluidos de los totales clasificados. El total del comprobante puede incluir otros conceptos además de base e IVA.';
  const summary = sheet(book, 'Resumen', ['Período', 'Operación', 'Clasificados', 'Pendientes', 'Subtotal / base IVA', 'IVA', 'Retención IVA', 'Retención renta', 'Total clasificado', 'Total pendiente'], company, period, note);
  const rates = sheet(book, 'Por tarifa', ['Período', 'Operación', 'Impuesto', 'Tarifa', 'Base', 'IVA / retenido'], company, period, 'Cada tarifa conserva su propia base e impuesto. No sumar las bases de retención de IVA y renta entre sí.');
  const docs = sheet(book, 'Comprobantes', ['Fecha', 'Mes', 'Operación', 'Tipo', 'Clave de acceso', 'Emisor', 'Nombre emisor', 'Receptor', 'Nombre receptor', 'Estado', 'Subtotal / base IVA', 'IVA', 'Retención IVA', 'Retención renta', 'Total clasificado', 'Total pendiente'], company, period, note);
  const taxes = sheet(book, 'Detalle impuestos', ['Fecha', 'Mes', 'Operación', 'Tipo', 'Clave de acceso', 'Impuesto', 'Tarifa', 'Base', 'IVA / retenido'], company, period, 'Una fila por línea de impuesto del comprobante clasificado. Importes con signo; las notas de crédito restan.');
  const prepared = vouchers.filter(v => operations[v.direccion]).map(v => {
    const date = new Date(v.fechaEmision);
    const monthKey = date.toISOString().slice(0, 7);
    const sign = v.tipoComprobante === 'NOTA_CREDITO' ? -1 : 1;
    const pending = !!v.clasificacionPendiente;
    const lines: TaxLine[] = pending ? [] : Array.isArray(v.detalleImpuestos) ? v.detalleImpuestos : v.xmlOriginal ? xmlTaxDetail(v.xmlOriginal) : [];
    const operation = operations[v.direccion];
    const subtotal = signed(sum(lines.filter(l => l.grupo === 'IVA').map(l => l.base)), sign);
    const amount = (group: string) => signed(sum(lines.filter(l => l.grupo === group).map(l => l.valor)), sign);
    const values = [subtotal, amount('IVA'), amount('RET_IVA'), amount('RENTA'), pending ? 0 : signed(v.importeTotal, sign), pending ? signed(v.importeTotal, sign) : 0];
    const row = docs.addRow([date, monthKey, operation, v.tipoComprobante, String(v.claveAcceso), String(v.rucEmisor), String(v.razonSocialEmisor ?? ''), String(v.identificacionContraparte ?? ''), String(v.razonSocialContraparte ?? ''), pending ? 'PENDIENTE' : 'CLASIFICADO', ...values]);
    row.getCell(1).numFmt = 'dd/mm/yyyy';
    for (const line of lines) {
      const taxRow = taxes.addRow([date, monthKey, operation, v.tipoComprobante, String(v.claveAcceso), line.grupo, String(line.tarifa), signed(line.base, sign), signed(line.valor, sign)]);
      taxRow.getCell(1).numFmt = 'dd/mm/yyyy';
    }
    return { monthKey, operation, pending, values, lines, sign };
  });
  const docEnd = Math.max(6, docs.rowCount), taxEnd = Math.max(6, taxes.rowCount);
  const range = (tab: string, col: string, end: number) => `'${tab}'!$${col}$6:$${col}$${end}`;
  const periods: (string | null)[] = month ? [period] : [...Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`), null];
  for (const selected of periods) {
    const items = prepared.filter(v => selected === null || v.monthKey === selected);
    for (const operation of Object.values(operations)) {
      const itemsOp = items.filter(v => v.operation === operation);
      const row = summary.addRow([selected ?? `TOTAL ${year}`, operation]);
      const n = row.number;
      const criteria = `${range('Comprobantes', 'C', docEnd)},$B${n}` + (selected === null ? '' : `,${range('Comprobantes', 'B', docEnd)},$A${n}`);
      row.getCell(3).value = { formula: `COUNTIFS(${criteria},${range('Comprobantes', 'J', docEnd)},"CLASIFICADO")`, result: itemsOp.filter(v => !v.pending).length };
      row.getCell(4).value = { formula: `COUNTIFS(${criteria},${range('Comprobantes', 'J', docEnd)},"PENDIENTE")`, result: itemsOp.filter(v => v.pending).length };
      ['K','L','M','N','O','P'].forEach((col, i) => {
        row.getCell(5 + i).value = { formula: `SUMIFS(${range('Comprobantes', col, docEnd)},${criteria})`, result: sum(itemsOp.map(v => v.values[i])) };
      });
    }
    const groups = new Map<string, { operation: string; group: string; rate: string; base: number[]; value: number[] }>();
    for (const v of items) for (const l of v.lines) {
      const key = `${v.operation}:${l.grupo}:${l.tarifa}`;
      const bucket = groups.get(key) ?? { operation: v.operation, group: l.grupo, rate: l.tarifa, base: [], value: [] };
      bucket.base.push(signed(l.base, v.sign)); bucket.value.push(signed(l.valor, v.sign)); groups.set(key, bucket);
    }
    for (const group of [...groups.values()].sort((a, b) => `${a.operation}:${a.group}:${a.rate}`.localeCompare(`${b.operation}:${b.group}:${b.rate}`))) {
      const row = rates.addRow([selected ?? `TOTAL ${year}`, group.operation, group.group, group.rate]);
      const n = row.number;
      const criteria = `${range('Detalle impuestos', 'C', taxEnd)},$B${n},${range('Detalle impuestos', 'F', taxEnd)},$C${n},${range('Detalle impuestos', 'G', taxEnd)},$D${n}` + (selected === null ? '' : `,${range('Detalle impuestos', 'B', taxEnd)},$A${n}`);
      row.getCell(5).value = { formula: `SUMIFS(${range('Detalle impuestos', 'H', taxEnd)},${criteria})`, result: sum(group.base) };
      row.getCell(6).value = { formula: `SUMIFS(${range('Detalle impuestos', 'I', taxEnd)},${criteria})`, result: sum(group.value) };
    }
  }
  finish(summary, [5,6,7,8,9,10]); finish(rates, [5,6]); finish(docs, [11,12,13,14,15,16]); finish(taxes, [8,9]);
  for (const ws of [summary, rates]) ws.eachRow(row => {
    if (String(row.getCell(1).value).startsWith('TOTAL ')) {
      row.font = { name: 'Calibri', bold: true, color: { argb: 'FF073E6E' } };
      row.border = { top: { style: 'thin', color: { argb: 'FF137E75' } } };
    }
  });
  const content = Buffer.from(await book.xlsx.writeBuffer());
  return { content, pendientes: prepared.filter(v => v.pending).length, comprobantes: prepared.length };
}
