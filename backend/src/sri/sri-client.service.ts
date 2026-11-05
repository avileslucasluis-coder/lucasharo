import { BadGatewayException, Injectable } from '@nestjs/common';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { sriEndpoints, sriEnvironment, SriEnvironment, normalizeAuthorizationEnvironment } from './sri-environment';

const array = <T>(valor: T | T[] | undefined): T[] => valor === undefined ? [] : Array.isArray(valor) ? valor : [valor];

function authorizationXml(value: string): string {
  // Some SRI responses encode the carriage return after the XML declaration as
  // a literal &#xD;. Decode only whitespace BEFORE the root, leaving signed
  // document contents and their entity references untouched.
  return value.replace(/^(\uFEFF?[ \t\r\n]*(?:<\?xml[^?]*\?>)?)([ \t\r\n]*(?:(?:&#x0*[da9];|&#0*(?:13|10|9);)[ \t\r\n]*)+)(?=<)/i,
    (_, prefix: string, padding: string) => prefix + padding.replace(/&#x0*d;|&#0*13;/gi, '\r')
      .replace(/&#x0*a;|&#0*10;/gi, '\n').replace(/&#x0*9;|&#0*9;/gi, '\t'));
}
export type SriMessage = { identificador: string; mensaje: string; informacionAdicional: string; tipo: string };
export interface SriAuthorization {
  estado: string; numeroAutorizacion: string; fechaAutorizacion: string; ambiente: string; comprobante: string; mensajes: SriMessage[];
}

@Injectable()
export class SriClientService {
  private readonly parser = new XMLParser({ removeNSPrefix: true, parseTagValue: false, trimValues: false });

  private mensajes(value: any): SriMessage[] {
    return array<any>(value?.mensaje).map((m) => ({
      identificador: String(m.identificador ?? '').trim(), mensaje: String(m.mensaje ?? '').trim(),
      informacionAdicional: String(m.informacionAdicional ?? '').trim(), tipo: String(m.tipo ?? '').trim(),
    }));
  }

  private async soap(endpoint: string, namespace: string, operacion: string, parametro: string, valor: string): Promise<any> {
    const body = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><sri:${operacion} xmlns:sri="${namespace}"><${parametro}>${valor}</${parametro}></sri:${operacion}></soap:Body></soap:Envelope>`;
    try {
      const respuesta = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
        body, signal: AbortSignal.timeout(20000), redirect: 'error',
      });
      if (!respuesta.body) throw new Error('Respuesta vacía del SRI.');
      const reader = respuesta.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('Respuesta del SRI demasiado grande.'); }
        chunks.push(value);
      }
      const xml = Buffer.concat(chunks).toString('utf8');
      if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('Respuesta XML inválida del SRI.');
      const contenido = this.parser.parse(xml)?.Envelope?.Body;
      if (contenido?.Fault) throw new Error(`SRI SOAP: ${String(contenido.Fault.faultstring ?? 'Error del servicio').slice(0, 300)}`);
      if (!respuesta.ok || !contenido?.[operacion + 'Response']) throw new Error(`Respuesta inesperada del SRI (HTTP ${respuesta.status}).`);
      return contenido[operacion + 'Response'];
    } catch (error) {
      const networkMessage = operacion === 'autorizacionComprobante'
        ? 'El SRI no respondió a la consulta del XML. Puedes reintentar los pendientes sin volver a cargar el TXT.'
        : 'No fue posible confirmar la respuesta del SRI. Consulta la autorización antes de reenviar.';
      const texto = error instanceof Error && /^(Respuesta|SRI SOAP)/.test(error.message) ? error.message : networkMessage;
      throw new BadGatewayException(texto);
    }
  }

  async recibir(xmlFirmado: string) {
    const respuesta = await this.soap(sriEndpoints(sriEnvironment()).recepcion, 'http://ec.gob.sri.ws.recepcion', 'validarComprobante', 'xml', Buffer.from(xmlFirmado, 'utf8').toString('base64'));
    const resultado = respuesta.RespuestaRecepcionComprobante;
    const estado = String(resultado?.estado ?? '').trim();
    if (!['RECIBIDA', 'DEVUELTA'].includes(estado)) throw new BadGatewayException('Estado de recepción desconocido del SRI.');
    const comprobantes = array<any>(resultado?.comprobantes?.comprobante).map((c) => ({
      claveAcceso: String(c.claveAcceso ?? '').trim(), mensajes: this.mensajes(c.mensajes),
    }));
    return { estado, comprobantes };
  }

  async consultar(claveAcceso: string, environment: SriEnvironment = sriEnvironment()): Promise<{ claveAcceso: string; autorizaciones: SriAuthorization[] }> {
    if (!/^\d{49}$/.test(claveAcceso)) throw new BadGatewayException('Clave inválida para la consulta SRI.');
    const respuesta = await this.soap(sriEndpoints(environment).autorizacion, 'http://ec.gob.sri.ws.autorizacion', 'autorizacionComprobante', 'claveAccesoComprobante', claveAcceso);
    const resultado = respuesta.RespuestaAutorizacionComprobante;
    if (!resultado || String(resultado.claveAccesoConsultada ?? '').trim() !== claveAcceso) {
      throw new BadGatewayException('La respuesta de autorización no corresponde a la clave consultada.');
    }
    const autorizaciones = array<any>(resultado.autorizaciones?.autorizacion).map((a): SriAuthorization => ({
      estado: String(a.estado ?? '').trim(), numeroAutorizacion: String(a.numeroAutorizacion ?? '').trim(),
      fechaAutorizacion: String(a.fechaAutorizacion ?? '').trim(), ambiente: normalizeAuthorizationEnvironment(String(a.ambiente ?? '')),
      comprobante: authorizationXml(String(a.comprobante ?? '')), mensajes: this.mensajes(a.mensajes),
    }));
    // numeroComprobantes es opcional en el WSDL; el SRI lo omite en rechazos
    // de consulta (respuesta real código80, estado RECHAZADA).
    const numero = resultado.numeroComprobantes;
    if ((numero !== undefined && (!/^\d+$/.test(String(numero).trim()) || autorizaciones.length !== Number(numero))) ||
        autorizaciones.some((a) => !['AUTORIZADO', 'NO AUTORIZADO', 'EN PROCESO', 'RECHAZADA'].includes(a.estado))) {
      throw new BadGatewayException('La respuesta de autorización del SRI está incompleta o contiene un estado desconocido.');
    }
    return { claveAcceso, autorizaciones };
  }
}
