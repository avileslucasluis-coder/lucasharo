import { Workbook, ValueType } from 'exceljs';
import { voucherExcel } from '../src/vouchers/voucher-excel';
import { VoucherExportService } from '../src/vouchers/voucher-export.service';
import { parseComprobanteXml } from '../src/vouchers/xml-parser.util';
import { xmlTaxDetail, taxSummary } from '../src/vouchers/tax-detail';

const company = { ruc: '0912345678001', razonSocial: 'Empresa de prueba' };
const key = '2210202601091234567800120010010000000011234567811';
// Dos artículos al 15 %, más artículos al 8 %, 5 %, 0 % y no objeto.
const articles = [[4,100,15],[4,50,7.5],[8,25,2],[5,20,1],[0,30,0],[6,10,0]];
const totals = [[4,150,22.5],[8,25,2],[5,20,1],[0,30,0],[6,10,0]];
const tax = (code: number, base: number, value: number) => `<codigo>2</codigo><codigoPorcentaje>${code}</codigoPorcentaje><baseImponible>${base}</baseImponible><valor>${value}</valor>`;
const xml = `<factura><infoTributaria><ruc>${company.ruc}</ruc><claveAcceso>${key}</claveAcceso></infoTributaria><infoFactura><fechaEmision>22/10/2026</fechaEmision><identificacionComprador>1790012345001</identificacionComprador><importeTotal>260.50</importeTotal><totalConImpuestos>${totals.map(([c,b,v]) => `<totalImpuesto>${tax(c,b,v)}</totalImpuesto>`).join('')}</totalConImpuestos></infoFactura><detalles>${articles.map(([c,b,v], i) => `<detalle><descripcion>Artículo ${i}</descripcion><impuestos><impuesto>${tax(c,b,v)}</impuesto></impuestos></detalle>`).join('')}</detalles></factura>`;
const mixed = () => ({ ...parseComprobanteXml(xml, company.ruc), id: 'mixed', xmlOriginal: xml, detalleImpuestos: xmlTaxDetail(xml), clasificacionPendiente: false });
const records = () => [mixed(),
  { ...mixed(), id: 'credit', tipoComprobante: 'NOTA_CREDITO', claveAcceso: '04'.padStart(49, '0'), detalleImpuestos: [{ grupo: 'IVA', tarifa: '15', base: 10, valor: 1.5 }], importeTotal: 11.5 },
  { ...mixed(), id: 'pending', claveAcceso: 'pending', clasificacionPendiente: true, importeTotal: 50 },
  { ...mixed(), id: 'purchase', fechaEmision: new Date('2026-01-01T00:00:00Z'), direccion: 'COMPRA', detalleImpuestos: [{ grupo: 'IVA', tarifa: '15', base: 100, valor: 15 }], importeTotal: 115 },
  ...['RETENCION_RECIBIDA','RETENCION_EMITIDA'].map((direction, i) => ({ ...mixed(), id: `ret${i}`, direccion: direction, tipoComprobante: 'RETENCION', detalleImpuestos: [{ grupo: 'RET_IVA', tarifa: '30', base: 15, valor: 4.5 }, { grupo: 'RENTA', tarifa: '10', base: 100, valor: 10 }], importeTotal: 14.5 })),
];
async function read(data: Buffer) { const book = new Workbook(); await book.xlsx.load(data as any); return book; }
const cached = (cell: any) => cell.type === ValueType.Formula ? cell.result ?? 0 : cell.value;

describe('Excel mensual/anual y facturas de IVA mixto', () => {
  it('clasifica los seis artículos con cinco tarifas sin duplicar bases ni impuestos', () => {
    const doc = mixed();
    expect(doc.importeTotal).toBe(260.5);
    expect(doc.montoIva).toBe(25.5);
    expect(taxSummary([doc]).map(v => [v.tarifa, v.base, v.valor])).toEqual([
      ['15',150,22.5], ['8',25,2], ['5',20,1], ['0',30,0], ['NO_OBJETO',10,0],
    ]);
  });
  it('exporta anual con meses, total del año, notas de crédito y pendientes separados', async () => {
    const result = await voucherExcel(company, records(), 2026);
    const book = await read(result.content);
    expect(book.worksheets.map(s => s.name)).toEqual(['Resumen','Por tarifa','Comprobantes','Detalle impuestos']);
    expect(result).toMatchObject({ pendientes: 1, comprobantes: 6 });
    const ws = book.getWorksheet('Resumen')!;
    const find = (period: string, op: string) => ws.getRows(6, ws.rowCount - 5)!.find(r => r.getCell(1).value === period && r.getCell(2).value === op)!;
    const sales = find('2026-10','Ventas');
    expect([3,4,5,6,9,10].map(c => cached(sales.getCell(c)))).toEqual([2,1,225,24,249,50]);
    expect(cached(find('TOTAL 2026','Ventas').getCell(9))).toBe(249);
    expect(cached(find('2026-01','Compras').getCell(9))).toBe(115);
    expect(cached(find('2026-02','Compras').getCell(9))).toBe(0);
    for (const op of ['Retenciones recibidas','Retenciones emitidas']) {
      expect([5,7,8,9].map(c => cached(find('TOTAL 2026', op).getCell(c)))).toEqual([0,4.5,10,14.5]);
    }
    expect(ws.rowCount).toBe(57);
    expect(sales.getCell(9).formula).toContain("'Comprobantes'!$O$6:$O$11");
    const rates = book.getWorksheet('Por tarifa')!;
    const rate15 = rates.getRows(6,rates.rowCount - 5)!.find(r => r.getCell(1).value === 'TOTAL 2026' && r.getCell(2).value === 'Ventas' && r.getCell(4).value === '15')!;
    expect([cached(rate15.getCell(5)), cached(rate15.getCell(6))]).toEqual([140,21]);
  });
  it('genera un Excel mensual numérico y conserva claves/cédulas como texto, sin fórmulas inyectadas', async () => {
    const data = { ...mixed(), razonSocialEmisor: '=HYPERLINK("https://example.com")' };
    const book = await read((await voucherExcel(company, [data], 2026, 10)).content);
    const docs = book.getWorksheet('Comprobantes')!;
    expect(docs.getCell('E6').value).toBe(key);
    expect(docs.getCell('F6').value).toBe(company.ruc);
    expect(docs.getCell('G6').type).toBe(ValueType.String);
    expect(docs.getCell('K6').value).toBe(235);
    expect(docs.getCell('L6').value).toBe(25.5);
    expect(docs.getCell('O6').value).toBe(260.5);
    expect(docs.getCell('O6').numFmt).toContain('0.00');
    expect(book.getWorksheet('Resumen')!.rowCount).toBe(9);
    expect(book.getWorksheet('Detalle impuestos')!.rowCount).toBe(10);
  });
  it('exporta períodos sin movimientos sin errores de fórmulas', async () => {
    const book = await read((await voucherExcel(company, [], 2026, 2)).content);
    expect(cached(book.getWorksheet('Resumen')!.getCell('I6'))).toBe(0);
    expect(book.getWorksheet('Comprobantes')!.rowCount).toBe(5);
  });
});

describe('Consulta del Excel por empresa y período', () => {
  const setup = () => {
    const prisma: any = { company: { findUnique: jest.fn().mockResolvedValue(company) }, voucher: { findMany: jest.fn().mockResolvedValue([]) } };
    return { prisma, service: new VoucherExportService(prisma) };
  };
  it.each([[2026,0],[2026,13],[2026,1.5],[NaN,1],[1999,1],[2101,1]])('rechaza período %s/%s antes de consultar datos', async (year, month) => {
    const { service, prisma } = setup();
    await expect(service.excel('empresa',year,month)).rejects.toMatchObject({ status:400 });
    expect(prisma.voucher.findMany).not.toHaveBeenCalled();
  });
  it.each([undefined,12])('filtra la empresa y el cierre anual con mes %s', async month => {
    const { service, prisma } = setup();
    const result = await service.excel('empresa',2026,month);
    const query = prisma.voucher.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ companyId:'empresa', fechaEmision:{ gte:new Date(month ? '2026-12-01Z' : '2026-01-01Z'), lt:new Date('2027-01-01Z') } });
    expect(result.filename).toMatch(/\.xlsx$/);
    expect(Buffer.from(result.contentBase64, 'base64').subarray(0,2).toString()).toBe('PK');
  });
});
