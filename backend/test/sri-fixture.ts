import { digitoVerificador } from '../src/sri/sri-xml';
export const ruc = '1790012345001';
const base = `2210202601${ruc}1001001000000001123456781`;
export const claveAcceso = base + digitoVerificador(base);
export const xmlPruebas = `<?xml version="1.0" encoding="UTF-8"?><factura id="comprobante" version="1.1.0"><infoTributaria><ambiente>1</ambiente><tipoEmision>1</tipoEmision><razonSocial>Empresa de prueba &amp; Cía.</razonSocial><ruc>${ruc}</ruc><claveAcceso>${claveAcceso}</claveAcceso><codDoc>01</codDoc><estab>001</estab><ptoEmi>001</ptoEmi><secuencial>000000001</secuencial><dirMatriz>Quito</dirMatriz></infoTributaria><infoFactura><fechaEmision>22/10/2026</fechaEmision><importeTotal>115.00</importeTotal></infoFactura></factura>`;
