import { BadGatewayException, BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { create } from 'xmlbuilder2';
import { PrismaService } from '../prisma/prisma.service';
import { SignatureService } from '../signature/signature.service';
import { AuditService } from '../audit/audit.service';
import { SriClientService } from './sri-client.service';
import { MAX_XML_BYTES, validarXmlComprobante } from './sri-xml';
import { Prisma } from '@prisma/client';
import { assertSriProductionEnabled, authorizationEnvironment, sriEnvironment, xmlEnvironmentCode } from './sri-environment';

const resumen = {
  id: true, companyId: true, claveAcceso: true, ambiente: true, tipoComprobante: true,
  estado: true, hashXml: true, respuestaRecepcion: true, respuestaAutorizacion: true,
  ultimoError: true, createdAt: true, updatedAt: true,
} as const;

@Injectable()
export class SriService {
  constructor(private readonly prisma: PrismaService, private readonly signature: SignatureService,
    private readonly client: SriClientService, private readonly audit: AuditService) {}

  listar(companyId: string) {
    return this.prisma.electronicDocument.findMany({ where: { companyId }, select: resumen, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async detalle(companyId: string, id: string) {
    const doc = await this.prisma.electronicDocument.findFirst({ where: { companyId, id } });
    if (!doc) throw new NotFoundException('Comprobante electrónico no encontrado en esta empresa.');
    return doc;
  }

  async preparar(companyId: string, xml: string, p12Base64: string, clave: string, userId: string) {
    const environment = sriEnvironment();
    assertSriProductionEnabled();
    const empresa = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada.');
    const datos = validarXmlComprobante(xml, empresa.ruc, xmlEnvironmentCode(environment));
    const existente = await this.prisma.electronicDocument.findUnique({
      where: { companyId_ambiente_claveAcceso: { companyId, ambiente: datos.ambiente, claveAcceso: datos.claveAcceso } },
    });
    if (existente && !['DEVUELTA', 'NO_AUTORIZADO'].includes(existente.estado)) {
      throw new ConflictException('La clave ya está registrada. Consulta su estado; no se firmará ni enviará por duplicado.');
    }
    const certificado = Buffer.from(p12Base64, 'base64');
    let xmlFirmado: string;
    try { xmlFirmado = await this.signature.firmarComprobante(xml, certificado, clave); }
    finally { certificado.fill(0); }
    if (Buffer.byteLength(xmlFirmado, 'utf8') > MAX_XML_BYTES) throw new BadRequestException('El XML firmado supera el límite de 320 KB del SRI.');
    const hashXml = createHash('sha256').update(xmlFirmado, 'utf8').digest('hex');
    const data = { companyId, ...datos, xmlFirmado, hashXml, estado: 'FIRMADO', ultimoError: null,
      xmlAutorizado: null, respuestaRecepcion: Prisma.DbNull, respuestaAutorizacion: Prisma.DbNull };
    try {
      const doc = await this.prisma.$transaction(async (tx) => {
        let id: string;
        if (existente) {
          const actualizado = await tx.electronicDocument.updateMany({ where: { id: existente.id, companyId, estado: existente.estado, updatedAt: existente.updatedAt }, data });
          if (actualizado.count !== 1) throw new ConflictException('El comprobante cambió mientras se firmaba. Actualiza el historial.');
          id = existente.id;
        } else {
          id = (await tx.electronicDocument.create({ data })).id;
        }
        await tx.auditLog.create({ data: {
          userId, companyId, modulo: 'SRI', accion: `FIRMAR_COMPROBANTE_${environment}`, registroId: id, resultado: 'OK',
          // Conserva la versión rechazada para trazabilidad; nunca contiene el PKCS12 ni su contraseña.
          valorAnterior: existente ? { hashXml: existente.hashXml, xmlFirmado: existente.xmlFirmado, estado: existente.estado } : undefined,
          valorNuevo: { claveAcceso: datos.claveAcceso, hashXml, ambiente: datos.ambiente },
        } });
        return tx.electronicDocument.findUniqueOrThrow({ where: { id }, select: resumen });
      });
      return doc;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('La clave ya fue registrada por otra solicitud. Actualiza el historial.');
      throw error;
    }
  }

  async enviar(companyId: string, id: string, userId: string) {
    assertSriProductionEnabled();
    const doc = await this.detalle(companyId, id);
    if (doc.ambiente !== xmlEnvironmentCode(sriEnvironment())) throw new ConflictException('El comprobante pertenece a otro ambiente SRI. No se enviará al ambiente configurado.');
    const lock = await this.prisma.electronicDocument.updateMany({
      where: { id, companyId, estado: 'FIRMADO', updatedAt: doc.updatedAt }, data: { estado: 'ENVIANDO', ultimoError: null },
    });
    if (lock.count !== 1) throw new ConflictException('Solo se envía un comprobante FIRMADO. Consulta la autorización si ya se intentó enviar.');
    try {
      await this.audit.registrar({ userId, companyId, modulo: 'SRI', accion: `ENVIAR_COMPROBANTE_${sriEnvironment()}`, registroId: id, resultado: 'OK', valorNuevo: { claveAcceso: doc.claveAcceso } });
      const respuesta = await this.client.recibir(doc.xmlFirmado);
      if (respuesta.comprobantes.some((c) => c.claveAcceso && c.claveAcceso !== doc.claveAcceso)) throw new BadGatewayException('El SRI devolvió una clave distinta a la enviada.');
      const pendiente = respuesta.comprobantes.some((c) => c.mensajes.some((m) => [43, 70].includes(Number(m.identificador))));
      return await this.prisma.electronicDocument.update({ where: { id }, data: {
        estado: respuesta.estado === 'RECIBIDA' ? 'RECIBIDA' : pendiente ? 'EN_PROCESO' : 'DEVUELTA', respuestaRecepcion: respuesta,
      }, select: resumen });
    } catch (error) {
      await this.prisma.electronicDocument.updateMany({ where: { id, companyId, estado: 'ENVIANDO' }, data: {
        estado: 'POR_CONFIRMAR', ultimoError: 'No se confirmó la recepción. Consulta la autorización antes de cualquier reenvío.',
      } });
      throw error;
    }
  }

  async consultar(companyId: string, id: string, userId: string) {
    const doc = await this.detalle(companyId, id);
    if (doc.estado === 'AUTORIZADO') return this.prisma.electronicDocument.findUniqueOrThrow({ where: { id }, select: resumen });
    if (doc.ambiente !== xmlEnvironmentCode(sriEnvironment())) throw new ConflictException('El comprobante pertenece a otro ambiente SRI. No se consultará en el ambiente configurado.');
    if (['ENVIANDO', 'CONSULTANDO'].includes(doc.estado) && Date.now() - doc.updatedAt.getTime() < 120000) {
      throw new ConflictException('Hay una operación en curso. Espera a que finalice.');
    }
    const lock = await this.prisma.electronicDocument.updateMany({
      where: { id, companyId, estado: doc.estado, updatedAt: doc.updatedAt }, data: { estado: 'CONSULTANDO' },
    });
    if (lock.count !== 1) throw new ConflictException('El comprobante cambió. Actualiza el historial.');
    try {
      const respuesta = await this.client.consultar(doc.claveAcceso);
      const autorizado = respuesta.autorizaciones.find((a) => a.estado === 'AUTORIZADO');
      const rechazo = respuesta.autorizaciones.length > 0 && respuesta.autorizaciones.every((a) => ['NO AUTORIZADO', 'RECHAZADA'].includes(a.estado));
      let xmlAutorizado: string | undefined;
      if (autorizado) {
        const empresa = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
        const environment = sriEnvironment();
        const identidad = validarXmlComprobante(autorizado.comprobante, empresa.ruc, xmlEnvironmentCode(environment));
        if (identidad.claveAcceso !== doc.claveAcceso || autorizado.numeroAutorizacion !== doc.claveAcceso ||
            !authorizationEnvironment(environment).includes(autorizado.ambiente.toUpperCase()) || !autorizado.fechaAutorizacion ||
            Number.isNaN(Date.parse(autorizado.fechaAutorizacion))) throw new BadGatewayException('Los datos autorizados no corresponden al ambiente SRI configurado.');
        xmlAutorizado = create({ version: '1.0', encoding: 'UTF-8' }).ele('autorizacion')
          .ele('estado').txt('AUTORIZADO').up().ele('numeroAutorizacion').txt(autorizado.numeroAutorizacion).up()
          .ele('fechaAutorizacion').txt(autorizado.fechaAutorizacion).up().ele('ambiente').txt(autorizado.ambiente).up()
          .ele('comprobante').dat(autorizado.comprobante).up().ele('mensajes').up().end({ prettyPrint: false });
      }
      const estado = autorizado ? 'AUTORIZADO' : rechazo ? 'NO_AUTORIZADO' : doc.estado === 'FIRMADO' ? 'FIRMADO' : doc.estado === 'DEVUELTA' ? 'DEVUELTA' : 'EN_PROCESO';
      await this.audit.registrar({ userId, companyId, modulo: 'SRI', accion: `CONSULTAR_AUTORIZACION_${sriEnvironment()}`, registroId: id, resultado: 'OK', valorNuevo: { estado } });
      return await this.prisma.electronicDocument.update({ where: { id }, data: {
        estado, xmlAutorizado, ultimoError: null,
        respuestaAutorizacion: { claveAcceso: respuesta.claveAcceso, autorizaciones: respuesta.autorizaciones.map(({ comprobante, ...a }) => a) },
      }, select: resumen });
    } catch (error) {
      await this.prisma.electronicDocument.updateMany({ where: { id, companyId, estado: 'CONSULTANDO' }, data: {
        estado: ['ENVIANDO', 'CONSULTANDO'].includes(doc.estado) ? 'POR_CONFIRMAR' : doc.estado,
        ultimoError: 'No se pudo verificar la autorización. Puedes volver a consultar.',
      } });
      throw error;
    }
  }
}
