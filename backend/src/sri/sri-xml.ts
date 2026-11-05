import { BadRequestException } from '@nestjs/common';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

export const MAX_XML_BYTES = 320 * 1024;
const tipos: Record<string, { codigo: string; info: string }> = {
  factura: { codigo: '01', info: 'infoFactura' },
  liquidacionCompra: { codigo: '03', info: 'infoLiquidacionCompra' },
  notaCredito: { codigo: '04', info: 'infoNotaCredito' },
  notaDebito: { codigo: '05', info: 'infoNotaDebito' },
  guiaRemision: { codigo: '06', info: 'infoGuiaRemision' },
  comprobanteRetencion: { codigo: '07', info: 'infoCompRetencion' },
};

export function digitoVerificador(valor: string): string {
  let suma = 0;
  for (let i = valor.length - 1, peso = 2; i >= 0; i--, peso = peso === 7 ? 2 : peso + 1) {
    suma += Number(valor[i]) * peso;
  }
  const digito = 11 - suma % 11;
  return String(digito === 11 ? 0 : digito === 10 ? 1 : digito);
}

/** Validación previa local. La estructura XSD y las reglas del emisor las valida el SRI. */
export function validarXmlComprobante(xml: string, rucEmpresa: string, ambienteEsperado: '1' | '2') {
  if (!xml || Buffer.byteLength(xml, 'utf8') > MAX_XML_BYTES) {
    throw new BadRequestException('El XML debe contener como máximo 320 KB.');
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new BadRequestException('XML inválido; no se permiten DTD ni entidades externas.');
  }
  const documento = new XMLParser({ ignoreAttributes: false, parseTagValue: false }).parse(xml);
  const raices = Object.keys(documento).filter((key) => !key.startsWith('?'));
  const raiz = raices[0];
  const tipo = tipos[raiz];
  const contenido = documento[raiz];
  if (raices.length !== 1 || !tipo || !contenido || Array.isArray(contenido) || contenido['@_id'] !== 'comprobante') {
    throw new BadRequestException('Se requiere un comprobante SRI con raíz admitida e id="comprobante".');
  }
  const info = contenido.infoTributaria;
  if (!info || Array.isArray(info) || info.ruc !== rucEmpresa) {
    throw new BadRequestException('El RUC emisor debe coincidir con la empresa seleccionada.');
  }
  if (info.ambiente !== ambienteEsperado) {
    const nombre = ambienteEsperado === '1' ? 'PRUEBAS (1)' : 'PRODUCCIÓN (2)';
    throw new BadRequestException(`El XML no corresponde al ambiente SRI ${nombre}.`);
  }
  const clave = String(info.claveAcceso ?? '');
  if (!/^\d{49}$/.test(clave) || digitoVerificador(clave.slice(0, 48)) !== clave[48]) {
    throw new BadRequestException('Clave de acceso inválida: se requieren 49 dígitos y un verificador correcto.');
  }
  if (info.codDoc !== tipo.codigo || clave.slice(8, 10) !== tipo.codigo || clave.slice(10, 23) !== rucEmpresa || clave[23] !== ambienteEsperado ||
      !/^\d{3}$/.test(info.estab) || !/^\d{3}$/.test(info.ptoEmi) || !/^\d{9}$/.test(info.secuencial) ||
      clave.slice(24, 30) !== info.estab + info.ptoEmi || clave.slice(30, 39) !== info.secuencial ||
      info.tipoEmision !== '1' || clave[47] !== '1') {
    throw new BadRequestException('La clave de acceso no coincide con el tipo, RUC, ambiente, serie, secuencial o emisión del XML.');
  }
  // En guías se utiliza la fecha inicial del traslado para la clave de acceso.
  const fecha = contenido[tipo.info]?.[raiz === 'guiaRemision' ? 'fechaIniTransporte' : 'fechaEmision'];
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fecha ?? '');
  const fechaUtc = partes ? new Date(Date.UTC(+partes[3], +partes[2] - 1, +partes[1])) : null;
  if (!partes || !fechaUtc || fechaUtc.getUTCDate() !== +partes[1] || fechaUtc.getUTCMonth() + 1 !== +partes[2] ||
      fechaUtc.getUTCFullYear() !== +partes[3] || clave.slice(0, 8) !== partes[1] + partes[2] + partes[3]) {
    throw new BadRequestException('La fecha del comprobante es inválida o no coincide con la clave de acceso.');
  }
  return { claveAcceso: clave, ambiente: ambienteEsperado, tipoComprobante: raiz };
}

/** Compatibilidad para los flujos y pruebas de certificación existentes. */
export function validarXmlPruebas(xml: string, rucEmpresa: string) { return validarXmlComprobante(xml, rucEmpresa, '1'); }
