import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { parseComprobanteXml, XmlComprobanteException } from './xml-parser.util';
import { xmlTaxDetail } from './tax-detail';
import { parseSriTxt } from './txt-parser';
import { assertPeriodOpen } from '../declarations/period-lock';
import { SriClientService } from '../sri/sri-client.service';
import { normalizeAuthorizationEnvironment } from '../sri/sri-environment';

@Injectable()
export class VouchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sri: SriClientService = new SriClientService(),
  ) {}

  async pendientesDetalle(companyId: string) {
    return this.prisma.voucher.findMany({
      where: { companyId, clasificacionPendiente: true },
      select: { claveAcceso: true }, orderBy: { fechaEmision: 'asc' },
    });
  }

  // One document per request: resumable on serverless deployments, no detached jobs.
  async completarSri(companyId: string, claveAcceso: string, userId: string) {
    const existing = await this.prisma.voucher.findUnique({
      where: { companyId_claveAcceso: { companyId, claveAcceso } },
    });
    if (!existing) throw new NotFoundException('Primero importa el comprobante desde el TXT de esta empresa.');
    if (!existing.clasificacionPendiente) return { completado: true };
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada.');
    const response = await this.sri.consultar(claveAcceso, 'PRODUCCION');
    const authorization = response.autorizaciones.find(a => a.estado === 'AUTORIZADO' && a.comprobante);
    if (!authorization) throw new BadRequestException('El SRI todavía no devolvió el XML autorizado. Reintenta más tarde.');
    if (!['PRODUCCION', '2'].includes(normalizeAuthorizationEnvironment(authorization.ambiente))) throw new BadRequestException('El XML no pertenece al ambiente de producción.');
    const parsed = parseComprobanteXml(authorization.comprobante, company.ruc);
    if (parsed.claveAcceso !== claveAcceso || parsed.direccion === 'NO_RELACIONADO') {
      throw new BadRequestException('El XML recibido no corresponde al comprobante o a la empresa.');
    }
    await this.importarXml(companyId, authorization.comprobante, userId);
    return { completado: true };
  }

  async importarXml(companyId: string, xmlContent: string, userId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada.');

    let parseado;
    try {
      parseado = parseComprobanteXml(xmlContent, company.ruc);
    } catch (e) {
      if (e instanceof XmlComprobanteException) throw new BadRequestException(e.message);
      throw e;
    }

    const yaExiste = await this.prisma.voucher.findUnique({
      where: { companyId_claveAcceso: { companyId, claveAcceso: parseado.claveAcceso } },
    });
    if (yaExiste && !yaExiste.clasificacionPendiente) {
      throw new BadRequestException('Este comprobante ya fue importado (clave de acceso duplicada).');
    }

    const voucher = await this.prisma.$transaction(async tx => {
      await assertPeriodOpen(tx, companyId, [parseado.fechaEmision, ...(yaExiste ? [yaExiste.fechaEmision] : [])]);
      const data = {
        companyId,
        tipoComprobante: parseado.tipoComprobante,
        direccion: parseado.direccion,
        claveAcceso: parseado.claveAcceso,
        xmlOriginal: xmlContent,
        detalleImpuestos: xmlTaxDetail(xmlContent) as unknown as Prisma.InputJsonValue,
        rucEmisor: parseado.rucEmisor,
        razonSocialEmisor: parseado.razonSocialEmisor,
        identificacionContraparte: parseado.identificacionContraparte,
        razonSocialContraparte: parseado.razonSocialContraparte,
        fechaEmision: parseado.fechaEmision,
        baseImponibleIva: parseado.baseImponibleIva,
        baseImponibleIva0: parseado.baseImponibleIva0,
        montoIva: parseado.montoIva,
        montoRentaRetenida: parseado.montoRentaRetenida,
        importeTotal: parseado.importeTotal,
        clasificacionPendiente: false, fuente: 'XML',
      };
      if (yaExiste) {
        const updated = await tx.voucher.updateMany({ where: { id: yaExiste.id, companyId, clasificacionPendiente: true }, data });
        if (updated.count !== 1) throw new BadRequestException('El comprobante ya fue completado por otra importación.');
        return tx.voucher.findUniqueOrThrow({ where: { id: yaExiste.id } });
      }
      return tx.voucher.create({ data });
    }).catch((error: unknown) => {
      // El índice único también protege las importaciones concurrentes.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('Este comprobante ya fue importado (clave de acceso duplicada).');
      }
      throw error;
    });

    // Una compra no demuestra que exista una retención ni determina sus
    // porcentajes. Las retenciones reales se importan desde su propio XML.
    const withholding = null;

    await this.audit.registrar({
      userId,
      companyId,
      accion: 'IMPORTAR_COMPROBANTE',
      modulo: 'VOUCHERS',
      registroId: voucher.id,
      valorNuevo: { tipoComprobante: voucher.tipoComprobante, direccion: voucher.direccion },
      resultado: 'OK',
    });

    const { xmlOriginal: _xmlOriginal, ...resumen } = voucher;
    return { voucher: resumen, withholding };
  }

  async importarTxt(companyId: string, txtContent: string, sentido: 'RECIBIDOS' | 'EMITIDOS', userId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada.');
    let records: any[];
    try { records = parseSriTxt(txtContent, company.ruc, sentido); }
    catch (e) { throw new BadRequestException((e as Error).message); }
    const result = await this.prisma.$transaction(async tx => {
      await assertPeriodOpen(tx, companyId, records.map(v => v.fechaEmision));
      const existing = await tx.voucher.findMany({ where: { companyId, claveAcceso: { in: records.map(v => v.claveAcceso) } }, select: { claveAcceso: true } });
      const keys = new Set(existing.map(v => v.claveAcceso));
      const fresh = records.filter(v => !keys.has(v.claveAcceso));
      const created = await tx.voucher.createMany({ data: fresh.map(v => ({ ...v, companyId })), skipDuplicates: true });
      return { importados: created.count, duplicados: records.length - created.count, pendientes: fresh.filter(v => v.clasificacionPendiente).length };
    });
    await this.audit.registrar({ userId, companyId, accion: 'IMPORTAR_TXT', modulo: 'VOUCHERS', valorNuevo: result, resultado: 'OK' });
    return result;
  }

  async listar(companyId: string, mes?: number, anio?: number) {
    const filtrarPeriodo = mes !== undefined || anio !== undefined;
    if (filtrarPeriodo && (!Number.isInteger(mes) || !Number.isInteger(anio) ||
      mes! < 1 || mes! > 12 || anio! < 2000 || anio! > 2100)) {
      throw new BadRequestException('Indica mes del 1 al 12 y año entre 2000 y 2100 juntos.');
    }
    const vouchers = await this.prisma.voucher.findMany({
      where: {
        companyId,
        ...(filtrarPeriodo
          ? {
              fechaEmision: {
                gte: new Date(anio!, mes! - 1, 1),
                lt: new Date(anio!, mes!, 1),
              },
            }
          : {}),
      },
      include: { withholding: true },
      orderBy: { fechaEmision: 'asc' },
    });
    return vouchers.map(({ xmlOriginal, ...resumen }) => ({ ...resumen, detalleImpuestos: resumen.detalleImpuestos ?? (xmlOriginal ? xmlTaxDetail(xmlOriginal) : []) }));
  }
}
