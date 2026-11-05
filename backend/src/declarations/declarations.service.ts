import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { AdjustmentsDto, FilingDto } from './adjustments.dto';
import { liquidarIva, liquidarRenta, amount, money, Values } from './tax-calculations';
import { encryptPdf, decryptPdf } from '../security/encrypted-files';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { taxSummary } from '../vouchers/tax-detail';
import { declarationReport } from './declaration-report';
import { declarationSource } from './declaration-source';
import { assertPeriodOpen } from './period-lock';
import { taxSource, sourceHash } from './tax-source';

/// Papel de trabajo mensual a partir de comprobantes importados. El 103
/// contiene retenciones de renta; las retenciones de IVA corresponden al 104.
/// No sustituye la conciliación ni presenta declaraciones ante el SRI.
@Injectable()
export class DeclarationsService {
  async fuentes(companyId: string, mes: number, anio: number) {
    this.validarPeriodo(mes, anio, 'MENSUAL');
    const desde = new Date(Date.UTC(anio, mes - 1, 1));
    const hasta = new Date(Date.UTC(anio, mes, 1));
    return this.prisma.$transaction(async tx => {
      const company = await tx.company.findUnique({ where: { id: companyId } });
      if (!company) throw new NotFoundException('Empresa no encontrada.');
      const operations = await tx.atsOperation.findMany({ where: { companyId, mes, anio } });
      const linkedIds = operations.flatMap(o => o.voucherId ? [o.voucherId] : []);
      const authorizations = operations.flatMap(o => {
        const value = (o.data as Record<string, unknown>).autorizacion;
        return typeof value === 'string' ? [value] : [];
      });
      const vouchers = await tx.voucher.findMany({ where: { companyId, OR: [
        { fechaEmision: { gte: desde, lt: hasta } },
        { direccion: 'COMPRA', fechaRegistroAts: { gte: desde, lt: hasta } },
        { id: { in: linkedIds } }, { claveAcceso: { in: authorizations } },
      ] } });
      return taxSource(company, vouchers, operations, `${anio}-${String(mes).padStart(2, '0')}`);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async generarParaPeriodo(companyId: string, mes: number, anio: number, userId: string, periodicidad = 'MENSUAL', ajustes?: AdjustmentsDto) {
    this.validarPeriodo(mes, anio, periodicidad);
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}), 0)`;
      return this.generarBloqueado(tx, companyId, mes, anio, userId, periodicidad, ajustes);
    }, { timeout: 15000 });
  }

  private async generarBloqueado(tx: Prisma.TransactionClient, companyId: string, mes: number, anio: number, userId: string, periodicidad = 'MENSUAL', ajustes?: AdjustmentsDto) {
    this.validarPeriodo(mes, anio, periodicidad);
    if (ajustes === undefined) {
      const saved = await tx.taxDeclaration.findUnique({where:{companyId_mes_anio_periodicidad:{companyId,mes,anio,periodicidad}}});
      if (saved?.ajustes && typeof saved.ajustes === 'object' && !Array.isArray(saved.ajustes)) ajustes = saved.ajustes as unknown as AdjustmentsDto;
    }
    const desde = new Date(Date.UTC(anio, periodicidad === 'ANUAL' ? 0 : periodicidad === 'SEMESTRAL' ? mes - 6 : mes - 1, 1));
    const hasta = new Date(Date.UTC(anio, mes, 1));

    const vouchers = await tx.voucher.findMany({
      where: { companyId, fechaEmision: { gte: desde, lt: hasta } },
    });

    if (vouchers.some(v => v.clasificacionPendiente)) throw new BadRequestException('Hay TXT pendientes de clasificación. Importa sus XML antes de generar la declaración.');

    let ventasGravadas = new Prisma.Decimal(0),
      ventas0 = new Prisma.Decimal(0),
      ivaVentas = new Prisma.Decimal(0);
    let comprasGravadas = new Prisma.Decimal(0),
      compras0 = new Prisma.Decimal(0),
      ivaCompras = new Prisma.Decimal(0);
    let ivaRetenidoEnVentas = new Prisma.Decimal(0),
      rentaRetenidaEnVentas = new Prisma.Decimal(0);
    let retIvaAplicada = new Prisma.Decimal(0),
      retRentaAplicada = new Prisma.Decimal(0);

    for (const v of vouchers) {
      const signo = v.tipoComprobante === 'NOTA_CREDITO' ? -1 : 1;
      const baseIva = new Prisma.Decimal(v.baseImponibleIva);
      const base0 = new Prisma.Decimal(v.baseImponibleIva0);
      const iva = new Prisma.Decimal(v.montoIva);

      switch (v.direccion) {
        case 'VENTA':
          ventasGravadas = ventasGravadas.plus(baseIva.times(signo));
          ventas0 = ventas0.plus(base0.times(signo));
          ivaVentas = ivaVentas.plus(iva.times(signo));
          break;
        case 'COMPRA':
          comprasGravadas = comprasGravadas.plus(baseIva.times(signo));
          compras0 = compras0.plus(base0.times(signo));
          ivaCompras = ivaCompras.plus(iva.times(signo));
          break;
        case 'RETENCION_RECIBIDA':
          ivaRetenidoEnVentas = ivaRetenidoEnVentas.plus(iva);
          rentaRetenidaEnVentas = rentaRetenidaEnVentas.plus(v.montoRentaRetenida);
          break;
        case 'RETENCION_EMITIDA':
          retIvaAplicada = retIvaAplicada.plus(iva);
          retRentaAplicada = retRentaAplicada.plus(v.montoRentaRetenida);
          break;
        default:
          break;
      }
    }

    // Las retenciones preparadas sobre compras no prueban una retención
    // emitida. Solo se suman los comprobantes de retención importados, en
    // su fecha de emisión, incluso si sustentan compras de otro período.
    const redondear = (valor: Prisma.Decimal) => valor.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
    const inputs = Object.fromEntries(Object.entries(ajustes ?? {}).filter(([, v]) => typeof v === 'string')) as Values;
    let liquidacion: Record<string, any> = {
      ...liquidarIva(ivaVentas, ivaCompras, ivaRetenidoEnVentas, retIvaAplicada, inputs),
      totalAPagar103: amount(retRentaAplicada.plus(inputs.multa103 ?? 0).plus(inputs.interes103 ?? 0)),
      conciliado: Boolean(ajustes),
    };
    if (periodicidad === 'ANUAL') {
      if (!ajustes || inputs.ingresosBrutos === undefined) throw new BadRequestException('La renta anual requiere ingresos y conciliación confirmados.');
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      liquidacion = { ...liquidarRenta(anio, company.regimen, company.tipoPersona, inputs),
        ingresosComprobantesInformativo: amount(ventasGravadas.plus(ventas0)),
        retencionesImportadasInformativo: amount(rentaRetenidaEnVentas), conciliado: true };
    }
    const totales = {
      totalVentasGravadas: redondear(ventasGravadas),
      totalVentas0: redondear(ventas0),
      totalIvaVentas: redondear(ivaVentas),
      totalComprasGravadas: redondear(comprasGravadas),
      totalCompras0: redondear(compras0),
      totalIvaCompras: redondear(ivaCompras),
      totalIvaRetenidoEnVentas: redondear(ivaRetenidoEnVentas),
      totalRetencionesIvaAplicadas: redondear(retIvaAplicada),
      totalRetencionesRentaAplicadas: redondear(retRentaAplicada),
    };
    Object.assign(liquidacion, declarationSource(vouchers), { desgloseTarifas: taxSummary(vouchers) });
    const fuentes = await this.fuentesCierre(tx, companyId, desde, hasta);
    liquidacion.fuentesCierre = fuentes;
    liquidacion.huellaFuentesCierre = sourceHash(fuentes);

    const declaration = await this.versionar(companyId, mes, anio, userId, 'GENERAR_BORRADOR', periodicidad, async tx => tx.taxDeclaration.upsert({
      where: { companyId_mes_anio_periodicidad: { companyId, mes, anio, periodicidad } },
      create: {
        companyId,
        periodicidad,
        mes,
        anio,
        ...totales,
        ajustes: ajustes ? JSON.parse(JSON.stringify(ajustes)) : Prisma.DbNull,
        liquidacion,
      },
      update: {
        ...totales,
        ajustes: ajustes ? JSON.parse(JSON.stringify(ajustes)) : Prisma.DbNull,
        liquidacion,
        estado: 'BORRADOR',
        fechaPresentacion: null,
        fechaGeneracion: new Date(),
      },
    }), tx);

    await this.audit.registrar({
      userId,
      companyId,
      accion: 'GENERAR_DECLARACION',
      modulo: 'DECLARATIONS',
      registroId: declaration.id,
      resultado: 'OK',
    }, tx);

    return {
      ...declaration,
      ivaAPagar104: Number(liquidacion.ivaAPagar104 ?? 0),
      creditoTributarioSiguientePeriodo: Number(liquidacion.creditoTributarioSiguientePeriodo ?? 0),
      totalAPagar103: Number(liquidacion.totalAPagar103 ?? 0),
      totalAPagar104: Number(liquidacion.totalAPagar104 ?? 0),
      ...Object.fromEntries(Object.entries(liquidacion).filter(([, v]) => typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)).map(([k,v]) => [k, Number(v)])),
      rentaRetenidaEnVentasInformativo: redondear(rentaRetenidaEnVentas),
      alcance: `PAPEL_TRABAJO_${periodicidad}`,
      periodoDesde: desde.toISOString().slice(0, 10),
      periodoHastaExclusivo: hasta.toISOString().slice(0, 10),
      advertencias: [
        periodicidad === 'ANUAL' ? 'Renta calculada con datos conciliados ingresados por el usuario; los comprobantes importados son una referencia que no acredita todos los ingresos y deducciones.' : periodicidad === 'SEMESTRAL'
          ? 'Consolidado de seis meses. Verifica que corresponda a tus obligaciones y que no existan declaraciones mensuales previas fuera de este sistema.'
          : 'Resumen de un mes. No sustituye un consolidado semestral cuando corresponda.',
        'Este papel de trabajo no presenta declaraciones ante el SRI ni determina por sí solo la periodicidad legal del contribuyente.',
        ajustes ? 'Los saldos, deducciones, rebajas, multas e intereses ingresados requieren respaldo. Se conserva la justificación de esta versión.' : 'Sin conciliación: se presume crédito por todo el IVA de compras y no se incluyen saldos anteriores ni ajustes.',
        'Las retenciones se obtienen de comprobantes importados; los cálculos de preparación no se consideran retenciones emitidas.',
      ],
    };
  }

  async marcarPresentada(companyId: string, mes: number, anio: number, userId: string, periodicidad = 'MENSUAL') {
    this.validarPeriodo(mes, anio, periodicidad);
    const declaration = await this.versionar(companyId, mes, anio, userId, 'REGISTRO_MANUAL', periodicidad, async tx => {
      const existente = await tx.taxDeclaration.findUnique({
        where: { companyId_mes_anio_periodicidad: { companyId, mes, anio, periodicidad } },
      });
      if (!existente) throw new NotFoundException('Primero genera el papel de trabajo del período.');
      return tx.taxDeclaration.update({
        where: { companyId_mes_anio_periodicidad: { companyId, mes, anio, periodicidad } },
        data: { estado: 'PRESENTADA_LOCAL', fechaPresentacion: new Date() },
      });
    });

    await this.audit.registrar({
      userId,
      companyId,
      accion: 'MODIFICAR_DECLARACION',
      modulo: 'DECLARATIONS',
      registroId: declaration.id,
      valorNuevo: { estado: 'PRESENTADA_LOCAL', origen: 'REGISTRO_MANUAL_USUARIO' },
      resultado: 'OK',
    });

    return { ...declaration, enviadaAlSri: false, mensaje: 'Presentación registrada manualmente. Este sistema no envió la declaración al SRI.' };
  }

  async historial(companyId: string, mes: number, anio: number, periodicidad = 'MENSUAL') {
    this.validarPeriodo(mes, anio, periodicidad);
    return this.prisma.declarationRevision.findMany({
      where: { declaration: { companyId, mes, anio, periodicidad } },
      orderBy: { version: 'asc' },
    });
  }

  async workflow(companyId: string, mes: number, anio: number, periodicidad: string, action: string, revision: number, motivo: string, actorId: string) {
    this.validarPeriodo(mes, anio, periodicidad);
    const transitions: Record<string, { from: string[]; to: string }> = {
      REVISAR: { from: ['BORRADOR', 'PRESENTADA_LOCAL'], to: 'EN_REVISION' },
      APROBAR: { from: ['EN_REVISION'], to: 'APROBADA' },
      CERRAR: { from: ['APROBADA'], to: 'CERRADA' },
      REABRIR: { from: ['EN_REVISION', 'APROBADA', 'CERRADA'], to: 'BORRADOR' },
    };
    const transition = transitions[action];
    if (!transition || motivo.trim().length < 10) throw new BadRequestException('Indica una acción válida y un motivo de al menos 10 caracteres.');
    return this.versionar(companyId, mes, anio, actorId, action, periodicidad, async tx => {
      const current = await tx.taxDeclaration.findUnique({ where: { companyId_mes_anio_periodicidad: { companyId, mes, anio, periodicidad } } });
      if (!current) throw new NotFoundException('Primero genera el papel de trabajo.');
      const last = await tx.declarationRevision.findFirst({ where: { declarationId: current.id }, orderBy: { version: 'desc' } });
      if (last?.version !== revision) throw new ConflictException('La versión cambió. Recarga el período antes de continuar.');
      if (!transition.from.includes(current.estado)) throw new ConflictException('La acción no corresponde al estado actual del período.');
      const liquidacion = current.liquidacion as Record<string, any>;
      if (action !== 'REABRIR') {
        if (!liquidacion?.conciliado) throw new ConflictException('Confirma la conciliación antes de revisar el período.');
        const vouchers = await tx.voucher.findMany({ where: { companyId, fechaEmision: {
          gte: new Date(Date.UTC(anio, periodicidad === 'ANUAL' ? 0 : periodicidad === 'SEMESTRAL' ? mes - 6 : mes - 1, 1)),
          lt: new Date(Date.UTC(anio, mes, 1)),
        } } });
        const fuentes = await this.fuentesCierre(tx, companyId,
          new Date(Date.UTC(anio, periodicidad === 'ANUAL' ? 0 : periodicidad === 'SEMESTRAL' ? mes - 6 : mes - 1, 1)),
          new Date(Date.UTC(anio, mes, 1)));
        if (!liquidacion.huellaFuentesCierre || sourceHash(fuentes) !== liquidacion.huellaFuentesCierre) {
          throw new ConflictException('Las fuentes tributarias cambiaron o el borrador es anterior al control integral. Reabre y genera nuevamente para revisar.');
        }
        if (declarationSource(vouchers).huellaComprobantes !== liquidacion.huellaComprobantes) {
          throw new ConflictException('Los comprobantes cambiaron o esta versión no tiene detalle histórico. Reabre y genera nuevamente antes de aprobar.');
        }
      }
      const result = await tx.taxDeclaration.update({ where: { id: current.id }, data: {
        estado: transition.to, liquidacion: { ...liquidacion, controlPeriodo: { accion: action, motivo: motivo.trim(), actorId, fecha: new Date().toISOString() } },
      } });
      await this.audit.registrar({ userId: actorId, companyId, accion: action + '_PERIODO', modulo: 'DECLARATIONS', registroId: current.id,
        valorAnterior: { estado: current.estado }, valorNuevo: { estado: transition.to, motivo: motivo.trim() }, resultado: 'OK' }, tx);
      return result;
    });
  }

  async reporte(companyId: string, declarationId: string, version: number) {
    if (!Number.isInteger(version) || version < 1) throw new BadRequestException('Versión inválida.');
    const revision = await this.prisma.declarationRevision.findFirst({
      where: { declarationId, version, declaration: { companyId } },
    });
    if (!revision) throw new NotFoundException('Versión no encontrada para esta empresa.');
    const snapshot = revision.snapshot as Record<string, any>;
    return {
      filename: `papel_trabajo_${snapshot.anio}_${snapshot.mes}_${snapshot.periodicidad}_v${version}.csv`,
      content: declarationReport(snapshot, version, revision.createdAt),
    };
  }

  async saldoAnterior(companyId: string, mes: number, anio: number, periodicidad = 'MENSUAL') {
    this.validarPeriodo(mes, anio, periodicidad);
    if (periodicidad === 'ANUAL') throw new BadRequestException('Esta consulta corresponde a saldos de IVA mensuales o semestrales.');
    const previous = new Date(Date.UTC(anio, mes - 1 - (periodicidad === 'SEMESTRAL' ? 6 : 1), 1));
    const declaration = await this.prisma.taxDeclaration.findUnique({
      where: { companyId_mes_anio_periodicidad: { companyId, mes: previous.getUTCMonth() + 1, anio: previous.getUTCFullYear(), periodicidad } },
    });
    if (!declaration) throw new NotFoundException('No hay papel de trabajo del período anterior. Ingresa los saldos de tu declaración del SRI en la conciliación.');
    const revision = await this.prisma.declarationRevision.findFirst({ where: { declarationId: declaration.id }, orderBy: { version: 'desc' } });
    const filing = revision && await this.prisma.taxFiling.findFirst({
      where: { declarationId: declaration.id, revision: revision.version, formulario: '104', tipo: 'PRESENTACION' },
      orderBy: { createdAt: 'desc' }, select: { numero: true, fecha: true },
    });
    if (!revision || !filing) throw new ConflictException('La última versión del período anterior no tiene respaldo de presentación del formulario 104 registrado. No se trasladan saldos desde borradores.');
    const snapshot = revision.snapshot as Record<string, any>;
    const liquidacion = snapshot.liquidacion;
    if (liquidacion?.conciliado !== true || !['creditoSiguienteCompras', 'creditoSiguienteRetenciones'].every(key => /^\d{1,9}\.\d{2}$/.test(String(liquidacion[key])))) {
      throw new ConflictException('La versión anterior no tiene saldos conciliados separados por origen. Revisa la declaración del SRI.');
    }
    return { mes: declaration.mes, anio: declaration.anio, revision: revision.version, respaldo: filing.numero,
      creditoAnteriorCompras: liquidacion.creditoSiguienteCompras, creditoAnteriorRetenciones: liquidacion.creditoSiguienteRetenciones,
      aviso: 'Propuesta tomada del papel de trabajo con presentación registrada manualmente. Compara ambos saldos con la declaración del SRI antes de aceptarlos.' };
  }

  async registrarEvidencia(dto: FilingDto, userId: string) {
    const fecha = new Date(dto.fecha);
    if (fecha > new Date()) throw new BadRequestException('La fecha no puede estar en el futuro.');
    const archivoCifrado = dto.archivoBase64 ? encryptPdf(dto.archivoBase64) : null;
    try {
      return await this.prisma.$transaction(async tx => {
        const declaration = await tx.taxDeclaration.findFirst({ where: { id: dto.declarationId, companyId: dto.companyId } });
        if (!declaration) throw new NotFoundException('Declaración no encontrada.');
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.companyId}), hashtext(${String(declaration.anio)}))`;
        if ((declaration.periodicidad === 'ANUAL') !== (dto.formulario === 'RENTA')) throw new BadRequestException('Formulario incompatible con el período.');
        const last = await tx.declarationRevision.findFirst({ where: { declarationId: declaration.id }, orderBy: { version: 'desc' } });
        if (last?.version !== dto.revision) throw new ConflictException('El papel de trabajo cambió. Consulta la última versión antes de registrar el respaldo.');
        if (dto.tipo === 'PRESENTACION' && declaration.periodicidad !== 'ANUAL') {
          const overlapping = await tx.taxDeclaration.count({ where: {
            companyId: dto.companyId, anio: declaration.anio,
            periodicidad: declaration.periodicidad === 'SEMESTRAL' ? 'MENSUAL' : 'SEMESTRAL',
            mes: declaration.periodicidad === 'SEMESTRAL' ? { gte: declaration.mes - 5, lte: declaration.mes } : (declaration.mes <= 6 ? 6 : 12),
            OR: [{ estado: 'PRESENTADA_LOCAL' }, { revisions: { some: { action: 'REGISTRO_MANUAL' } } }, { filings: { some: { tipo: 'PRESENTACION' } } }],
          } });
          if (overlapping) throw new ConflictException('Existe una presentación en un período superpuesto. Concilia los registros antes de continuar.');
        }
        if (dto.tipo === 'PAGO' && !await tx.taxFiling.count({ where: { declarationId: declaration.id, formulario: dto.formulario, tipo: 'PRESENTACION', revision: dto.revision } }))
          throw new BadRequestException('Registra primero la presentación de este formulario y versión.');
        const filing = await tx.taxFiling.create({ data: { declarationId: declaration.id, revision: dto.revision,
          formulario: dto.formulario, tipo: dto.tipo, numero: dto.numero, fecha, valor: dto.valor,
          actorId: userId, observacion: dto.observacion, archivoCifrado,
          hashArchivo: dto.archivoBase64 ? createHash('sha256').update(Buffer.from(dto.archivoBase64, 'base64')).digest('hex') : null,
        }, select: { id: true, tipo: true, numero: true } });
        await this.audit.registrar({ userId, companyId: dto.companyId, accion: `REGISTRAR_${dto.tipo}`, modulo: 'DECLARATIONS', registroId: filing.id, resultado: 'OK' }, tx);
        return { ...filing, verificadoPorSri: false };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Ese comprobante ya está registrado.');
      throw e;
    }
  }

  async evidencias(companyId: string, declarationId: string) {
    const declaration = await this.prisma.taxDeclaration.findFirst({ where: { id: declarationId, companyId } });
    if (!declaration) throw new NotFoundException('Declaración no encontrada.');
    return this.prisma.taxFiling.findMany({ where: { declarationId }, orderBy: { createdAt: 'desc' },
      select: { id: true, revision: true, formulario: true, tipo: true, numero: true, fecha: true, valor: true,
        observacion: true, hashArchivo: true, createdAt: true } });
  }

  async archivoEvidencia(companyId: string, id: string) {
    const record = await this.prisma.taxFiling.findFirst({ where: { id, declaration: { companyId } } });
    if (!record?.archivoCifrado) throw new NotFoundException('Respaldo no encontrado.');
    return { archivoBase64: decryptPdf(record.archivoCifrado), nombre: `respaldo-${record.id}.pdf`, hash: record.hashArchivo };
  }

  private async fuentesCierre(tx: Prisma.TransactionClient, companyId: string, desde: Date, hasta: Date) {
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
    const operations = await tx.atsOperation.findMany({ where: { companyId, anio: desde.getUTCFullYear(),
      mes: { gte: desde.getUTCMonth() + 1, lte: hasta.getUTCMonth() || 12 } }, orderBy: { id: 'asc' } });
    const documents = await tx.voucher.findMany({ where: { companyId, OR: [
      { fechaEmision: { gte: desde, lt: hasta } },
      { fechaRegistroAts: { gte: desde, lt: hasta } },
      { id: { in: operations.flatMap(o => o.voucherId ? [o.voucherId] : []) } },
    ] }, orderBy: { id: 'asc' } });
    const decisions = await tx.periodDecision.findMany({ where: { companyId, voucherId: { in: documents.map(v => v.id) } },
      orderBy: [{ voucherId: 'asc' }, { version: 'asc' }] });
    // Serializar conserva fechas y decimales, sin guardar XML original ni datos de acceso.
    return JSON.parse(JSON.stringify({ version: 1, company, operations, decisions,
      documents: documents.map(({ xmlOriginal, ...document }) => ({ ...document, xmlHash: xmlOriginal ? sourceHash(xmlOriginal) : null })) }));
  }

  private async versionar<T extends { id: string }>(
    companyId: string, mes: number, anio: number, actorId: string, action: string,
    periodicidad: string,
    mutation: (tx: Prisma.TransactionClient) => Promise<T>,
    transaction?: Prisma.TransactionClient,
  ): Promise<T & { revision: number }> {
    const run = async (tx: Prisma.TransactionClient) => {
      // Serializa el ejercicio para comprobar solapamientos entre meses y semestres.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}), 0)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}), hashtext(${String(anio)}))`;
      if (action === 'GENERAR_BORRADOR') {
        const first = periodicidad === 'ANUAL' ? 1 : periodicidad === 'SEMESTRAL' ? mes - 5 : mes;
        await assertPeriodOpen(tx, companyId, Array.from({ length: mes - first + 1 }, (_, i) => new Date(Date.UTC(anio, first - 1 + i, 1))));
      }
      const solapamientos = periodicidad === 'ANUAL' ? 0 : await tx.taxDeclaration.count({ where: {
        companyId, anio,
        OR: [{ estado: 'PRESENTADA_LOCAL' }, { revisions: { some: { action: 'REGISTRO_MANUAL' } } }, { filings: { some: { tipo: 'PRESENTACION' } } }],
        periodicidad: periodicidad === 'SEMESTRAL' ? 'MENSUAL' : 'SEMESTRAL',
        mes: periodicidad === 'SEMESTRAL' ? { gte: mes - 5, lte: mes } : (mes <= 6 ? 6 : 12),
      } });
      if (solapamientos) throw new BadRequestException('Existe un período superpuesto registrado como presentado. Concilia las presentaciones antes de generar o registrar este período para evitar duplicar valores.');
      const previous = await tx.taxDeclaration.findUnique({ where: { companyId_mes_anio_periodicidad: { companyId, mes, anio, periodicidad } } });
      if (previous && ['EN_REVISION', 'APROBADA', 'CERRADA'].includes(previous.estado) && ['GENERAR_BORRADOR', 'REGISTRO_MANUAL'].includes(action)) {
        throw new ConflictException('El período está en revisión, aprobado o cerrado. Reábrelo con justificación antes de cambiar los cálculos.');
      }
      const result = await mutation(tx);
      const last = await tx.declarationRevision.findFirst({ where: { declarationId: result.id }, orderBy: { version: 'desc' } });
      await tx.declarationRevision.create({ data: {
        declarationId: result.id, version: (last?.version ?? 0) + 1, actorId, action,
        previous: previous ? JSON.parse(JSON.stringify(previous)) : Prisma.DbNull,
        snapshot: JSON.parse(JSON.stringify(result)),
      } });
      return { ...result, revision: (last?.version ?? 0) + 1 };
    };
    return transaction ? run(transaction) : this.prisma.$transaction(run);
  }

  private validarPeriodo(mes: number, anio: number, periodicidad = 'MENSUAL') {
    if (!['MENSUAL', 'SEMESTRAL', 'ANUAL'].includes(periodicidad) || (periodicidad === 'SEMESTRAL' && ![6, 12].includes(mes)) || (periodicidad === 'ANUAL' && mes !== 12)) {
      throw new BadRequestException('Selecciona período mensual o semestre con cierre en junio o diciembre.');
    }
    if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      throw new BadRequestException('El período requiere un mes del 1 al 12 y un año entre 2000 y 2100.');
    }
  }
}
