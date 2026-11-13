import { moneyTxt, parseSriTxt } from '../src/vouchers/txt-parser';
import { taxSummary, xmlTaxDetail } from '../src/vouchers/tax-detail';
import { validate } from 'class-validator';
import { RegisterDto, ResetPasswordDto } from '../src/auth/dto/auth.dto';

const key = '0111202601179001234500120010010000000011234567811';
const company = '1790098765001';
const invoice = (rate: string, base: string, iva: string) => [
  'CLAVE_ACCESO\tRUC_EMISOR\tFECHA_EMISION\tTIPO_COMPROBANTE\tTARIFA_IVA\tBASE_IMPONIBLE\tIVA',
  `${key}\t1790012345001\t01/11/2026\tFACTURA\t${rate}\t${base}\t${iva}`,
].join('\n');
describe('Importación monetaria y clasificación', () => {
  it.each([['1234.56',1234.56],['1.234,56',1234.56],['1234,56',1234.56],['0',0],['.89',0.89],['.16',0.16],['.02',0.02],['.9',0.9],[',89',0.89],[',9',0.9],['.00',0],[' $ .89 ',0.89]])('importe %s', (text, expected) => expect(moneyTxt(text as string)).toBe(expected));
  it.each(['1,234.56','1.2.3','-1','NaN','','12.345','.',' , ','.001',',001','-.89','.,89','.8.9'])('rechaza %s', raw => expect(() => moneyTxt(raw)).toThrow());
  it('importa totales del listado SRI sin cero inicial y conserva la clasificación pendiente', () => {
    const txt = [
      'CLAVE_ACCESO\tRUC_EMISOR\tFECHA_EMISION\tTIPO_COMPROBANTE\tVALOR_SIN_IMPUESTOS\tIVA\tIMPORTE_TOTAL',
      `${key}\t1790012345001\t01/11/2026\tFACTURA\t.89\t0\t.89`,
      `${key.slice(0, -1)}2\t1790012345001\t01/11/2026\tFACTURA\t.16\t.02\t.18`,
    ].join('\n');
    const rows = parseSriTxt(txt, company, 'RECIBIDOS');
    expect(rows.map(row => row.importeTotal)).toEqual([0.89, 0.18]);
    expect(rows.every(row => row.clasificacionPendiente)).toBe(true);
    expect(taxSummary(rows)).toEqual([]);
  });
  it('clasifica facturas con base e IVA sin cero inicial', () => {
    const row = parseSriTxt(invoice('15', '.20', '.03'), company, 'RECIBIDOS')[0];
    expect(row.detalleImpuestos).toEqual([{ grupo: 'IVA', tarifa: '15', base: 0.2, valor: 0.03 }]);
    expect(row.importeTotal).toBe(0.23);
  });
  it.each([['IVA','30','.06'],['RENTA','10','.02']])('importa retenciones %s sin cero inicial', (group, rate, retained) => {
    const txt = `CLAVE_ACCESO;RUC_EMISOR;FECHA_EMISION;TIPO_COMPROBANTE;IMPUESTO;PORCENTAJE_RETENCION;BASE_IMPONIBLE;VALOR_RETENIDO\n${key};1790012345001;01/11/2026;RETENCION;${group};${rate};,20;${retained}`;
    const row = parseSriTxt(txt, company, 'RECIBIDOS')[0];
    expect(row.detalleImpuestos[0].base).toBe(0.2);
    expect(row.detalleImpuestos[0].valor).toBe(Number(retained));
    expect(row.importeTotal).toBe(Number(retained));
    expect(row.clasificacionPendiente).toBe(false);
  });
  it.each(['0','5','8','15','NO_OBJETO'])('clasifica IVA %s', rate => {
    const rows = parseSriTxt(invoice(rate, '100,00', `${Number(rate) || 0},00`), company, 'RECIBIDOS');
    expect(rows[0].detalleImpuestos[0].tarifa).toBe(rate);
    expect(rows[0].clasificacionPendiente).toBe(false);
  });
  it('separa cero y no objeto, y resta notas de crédito en centavos', () => {
    const a = parseSriTxt(invoice('0','0.10','0'), company, 'RECIBIDOS')[0];
    const b = parseSriTxt(invoice('NO_OBJETO','0.20','0'), company, 'RECIBIDOS')[0];
    const c = {...a, tipoComprobante:'NOTA_CREDITO'};
    expect(taxSummary([a,b,c]).map(v => v.base)).toEqual([0,0.2]);
  });
  it('no deduce tarifas de un listado sin detalle', () => {
    const txt = `CLAVE_ACCESO\tRUC_EMISOR\tFECHA_EMISION\tTIPO_COMPROBANTE\tIMPORTE_TOTAL\n${key}\t1790012345001\t01/11/2026\tFACTURA\t115.00`;
    const rows = parseSriTxt(txt, company, 'RECIBIDOS');
    expect(rows[0].clasificacionPendiente).toBe(true);
    expect(rows[0].importeTotal).toBe(115);
    expect(taxSummary(rows)).toEqual([]);
  });
  it('rechaza inconsistencias y empresa ajena', () => {
    expect(() => parseSriTxt(invoice('15','100','5'), company, 'RECIBIDOS')).toThrow('Fila 2');
    expect(() => parseSriTxt(invoice('15','100','15'), company, 'EMITIDOS')).toThrow('empresa');
  });
  it.each([['IVA','30'],['IVA','70'],['IVA','100'],['IVA','0'],['IVA','10'],['IVA','20'],['IVA','50'],['RENTA','15'],['RENTA','10'],['RENTA','5'],['RENTA','3'],['RENTA','2'],['RENTA','1'],['RENTA','0']])('retención %s %s', (group, rate) => {
    const txt = `CLAVE_ACCESO;RUC_EMISOR;FECHA_EMISION;TIPO_COMPROBANTE;IMPUESTO;PORCENTAJE_RETENCION;BASE_IMPONIBLE;VALOR_RETENIDO\n${key};1790012345001;01/11/2026;RETENCION;${group};${rate};100;${rate}`;
    const v = parseSriTxt(txt, company, 'RECIBIDOS')[0];
    expect(v.importeTotal).toBe(Number(rate));
    expect(v.detalleImpuestos[0].grupo).toBe(group === 'IVA' ? 'RET_IVA' : 'RENTA');
  });
  it('conserva codificación XML de cero, no objeto y exento', () => {
    const xml = '<factura><infoFactura><totalConImpuestos>' + ['0','6','7','4','5','8'].map(c => `<totalImpuesto><codigo>2</codigo><codigoPorcentaje>${c}</codigoPorcentaje><baseImponible>100</baseImponible><valor>0</valor></totalImpuesto>`).join('') + '</totalConImpuestos></infoFactura></factura>';
    expect(xmlTaxDetail(xml).map(l => l.tarifa)).toEqual(['0','NO_OBJETO','EXENTO','15','5','8']);
  });
  it('exige entre ocho y diez caracteres al registrar y restablecer', async () => {
    for (const password of ['12345678','01234567','abcdef12','1234567','123456789','abc123!xyz','12345678901']) {
      const dto = Object.assign(new RegisterDto(), {ruc:'0912345678',email:'a@example.com',nombre:'Prueba',password});
      const reset = Object.assign(new ResetPasswordDto(), {token:'a'.repeat(64),password});
      expect((await validate(dto)).length === 0).toBe(password.length >= 8 && password.length <= 10);
      expect((await validate(reset)).length === 0).toBe(password.length >= 8 && password.length <= 10);
    }
  });
});
