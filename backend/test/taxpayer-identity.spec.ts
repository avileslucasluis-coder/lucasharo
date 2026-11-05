import { sameTaxpayer } from '../src/vouchers/taxpayer-identity';
import { parseSriTxt } from '../src/vouchers/txt-parser';
import { parseComprobanteXml } from '../src/vouchers/xml-parser.util';

const cedula = '0912345678';
const ruc = `${cedula}001`;
const other = '1790012345001';
const key = '0111202601179001234500120010010000000011234567811';
const txt = (emitter: string, recipient: string) =>
  `CLAVE_ACCESO\tRUC_EMISOR\tIDENTIFICACION_RECEPTOR\tFECHA_EMISION\tTIPO_COMPROBANTE\tIMPORTE_TOTAL\n${key}\t${emitter}\t${recipient}\t01/11/2026\tFACTURA\t115.00`;

describe('Equivalencia de cédula y RUC en importaciones', () => {
  it.each([[cedula, ruc], [ruc, cedula], [ruc, ruc], [cedula, cedula], [` ${cedula} `, ruc]])('reconoce %s y %s', (a, b) => {
    expect(sameTaxpayer(a, b)).toBe(true);
  });
  it.each([
    [cedula, '0912345679001'], [cedula, `${cedula}002`],
    ['1790012345', other], ['', ''], ['912345678', ruc],
    ['091234567X', '091234567X001'], [ruc, `${cedula}002`],
  ])('no confunde %s con %s', (a, b) => {
    expect(sameTaxpayer(a, b)).toBe(false);
  });
  it.each([[cedula, ruc], [ruc, cedula]])('importa recibidos a %s para %s conservando identificación', (recipient, company) => {
    const [voucher] = parseSriTxt(txt(other, recipient), company, 'RECIBIDOS');
    expect(voucher.identificacionContraparte).toBe(recipient);
    expect(voucher.importeTotal).toBe(115);
  });
  it.each([[cedula, ruc], [ruc, cedula]])('importa emitidos por %s para %s', (emitter, company) => {
    expect(parseSriTxt(txt(emitter, other), company, 'EMITIDOS')[0].rucEmisor).toBe(emitter);
  });
  it('mantiene el rechazo de comprobantes ajenos', () => {
    expect(() => parseSriTxt(txt(other, '0912345679'), ruc, 'RECIBIDOS')).toThrow('empresa seleccionada');
    expect(() => parseSriTxt(txt(other, cedula), ruc, 'EMITIDOS')).toThrow('empresa seleccionada');
  });
  it.each(['123', '091234567890', '091234567X'])('rechaza emisor mal formado %s', emitter => {
    expect(() => parseSriTxt(txt(emitter, cedula), ruc, 'RECIBIDOS')).toThrow('emisor inválido');
  });
  it.each([[other, cedula, ruc, 'COMPRA'], [ruc, other, cedula, 'VENTA'], [other, '0912345679', ruc, 'NO_RELACIONADO']])('clasifica XML con emisor %s y receptor %s', (emitter, recipient, company, direction) => {
    const xml = `<factura><infoTributaria><ruc>${emitter}</ruc><claveAcceso>${key}</claveAcceso></infoTributaria><infoFactura><fechaEmision>01/11/2026</fechaEmision><identificacionComprador>${recipient}</identificacionComprador><importeTotal>115</importeTotal></infoFactura></factura>`;
    expect(parseComprobanteXml(xml, company).direccion).toBe(direction);
  });
});
