import { parseSriTxt } from '../src/vouchers/txt-parser';
import { digitoVerificador } from '../src/sri/sri-xml';
import { taxSummary } from '../src/vouchers/tax-detail';

const company = '0912345678001';
const client = '1790012345001';
const access = (code = '01', emitter = company) => {
  const body = `22102026${code}${emitter}2001001000000223415627651`;
  return body + digitoVerificador(body);
};
const header = 'FECHA_EMISION\tCOMPROBANTE\tNUMERO_COMPROBANTE\tIDENTIFICACION_RECEPTOR\tRAZON_SOCIAL\tCLAVE_ACCESO\tVALOR_TOTAL';
const txt = (key = access(), type = 'Factura') => `${header}\n22/10/2026\t${type}\t001-001-000000223\t${client}\tCLIENTE DE PRUEBA\t${key}\t1596`;

describe('Listado SRI de comprobantes emitidos sin columna RUC', () => {
  it.each([company, company.slice(0, 10)])('lee ventas para la empresa %s sin confundir emisor y cliente', selected => {
    const rows = parseSriTxt(txt(), selected, 'EMITIDOS');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rucEmisor: company, razonSocialEmisor: company,
      identificacionContraparte: client, razonSocialContraparte: 'CLIENTE DE PRUEBA',
      direccion: 'VENTA', tipoComprobante: 'FACTURA', importeTotal: 1596, clasificacionPendiente: true });
    expect(taxSummary(rows)).toEqual([]);
  });
  it.each([['04', 'Nota de crédito', 'NOTA_CREDITO', 'VENTA'], ['07', 'Comprobante de Retención', 'RETENCION', 'RETENCION_EMITIDA']])('reconoce el tipo %s del listado', (code, type, expected, direction) => {
    expect(parseSriTxt(txt(access(code), type), company, 'EMITIDOS')[0]).toMatchObject({ tipoComprobante: expected, direccion: direction, clasificacionPendiente: true });
  });
  it('rechaza una clave de otro emisor aunque la empresa esté seleccionada', () => {
    expect(() => parseSriTxt(txt(access('01', client)), company, 'EMITIDOS')).toThrow('empresa seleccionada');
  });
  it('rechaza clave alterada, fecha y tipo inconsistentes', () => {
    const key = access();
    expect(() => parseSriTxt(txt(key.slice(0, 48) + (Number(key[48]) + 1) % 10), company, 'EMITIDOS')).toThrow('verificador');
    expect(() => parseSriTxt(txt().replace('22/10/2026', '21/10/2026'), company, 'EMITIDOS')).toThrow('fecha de emisión');
    expect(() => parseSriTxt(txt(access(), 'Nota de crédito'), company, 'EMITIDOS')).toThrow('tipo de comprobante');
  });
  it('no sustituye una columna de RUC vacía o inválida ni asume recibidos', () => {
    for (const emitter of ['', '123']) {
      const content = txt().split('\n').map((line, index) => `${line}\t${index === 0 ? 'RUC_EMISOR' : emitter}`).join('\n');
      expect(() => parseSriTxt(content, company, 'EMITIDOS')).toThrow('emisor inválido');
    }
    expect(() => parseSriTxt(txt(), company, 'RECIBIDOS')).toThrow('emisor inválido');
  });
});
