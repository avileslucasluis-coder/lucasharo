import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { create } from 'xmlbuilder2';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { leerFuenteAts, codigoDocumentoSri, FuenteAts, RetencionFuente } from './ats-source.util';
import { tipoIdentificacionAts } from './ats-metadata';
import { AtsReviewDto } from './ats-review.dto';
import { validarXsd } from './ats-xsd';
import { AtsOperationDto } from './ats-operation.dto';
import { operationTypes, operationSchema, appendFields, validateOperation } from './ats-operation-schema';
import { assertPeriodOpen } from '../declarations/period-lock';

export interface ErrorValidacionAts { campo: string; mensaje: string; }
type Linked = { voucher: any; soporte: RetencionFuente };
const decimal = (v: any) => new Prisma.Decimal(v ?? 0);
const fecha = (d: Date) => `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
const numberDoc = (v: any) => v.claveAcceso.slice(24,39);
const revision = (v: any): any => v.atsRevision ?? {};
const source = (v: any) => leerFuenteAts(v.xmlOriginal);
const camposIva: Record<string,string> = { '10':'valRetBien10', '20':'valRetServ20', '30':'valorRetBienes', '50':'valRetServ50', '70':'valorRetServicios', '100':'valRetServ100' };

@Injectable()
export class AtsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  schemas() { return Object.keys(operationTypes).map(operationSchema); }

  async operations(companyId: string, mes: number, anio: number) {
    if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(anio) || anio < 2000 || anio > 2100) throw new BadRequestException('Período inválido.');
    return this.prisma.atsOperation.findMany({ where: { companyId, mes, anio }, orderBy: { createdAt:'asc' } });
  }

  async saveOperation(dto: AtsOperationDto, userId: string) {
    await validateOperation(dto.kind, dto.data, dto.mes, dto.anio);
    const d = dto.data;
    const identity = createHash('sha256').update(JSON.stringify([operationTypes[dto.kind].section, d.idProv ?? d.idClienteEx ?? d.identificacionRecap,
      d.tipoComprobante, d.establecimiento, d.puntoEmision, d.secuencial ?? d.secuencialInicio, d.autorizacion, d.codSustento,
      d.numeroRecap, d.rucFideicomiso, d.idBeneficiario, d.idRetenido])).digest('hex');
    try {
      return await this.prisma.$transaction(async tx => {
        await assertPeriodOpen(tx, dto.companyId, [new Date(Date.UTC(dto.anio, dto.mes - 1, 1))]);
        // Serialize changes within the period, including overlapping annulled ranges.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.companyId + ':' + dto.anio + ':' + dto.mes}))`;
        if (dto.kind === 'ANULADO') {
          const records = await tx.atsOperation.findMany({where:{companyId:dto.companyId,mes:dto.mes,anio:dto.anio,kind:'ANULADO',...(dto.id ? {id:{not:dto.id}} : {})}});
          if (records.some(record => {
            const other = record.data as any;
            return ['tipoComprobante','establecimiento','puntoEmision','autorizacion'].every(k => other[k] === d[k]) && BigInt(other.secuencialInicio) <= BigInt(d.secuencialFin) && BigInt(d.secuencialInicio) <= BigInt(other.secuencialFin);
          })) throw new ConflictException('El rango de anulados se superpone con otro registro.');
        }
        if (dto.voucherId) {
          const voucher = await tx.voucher.findFirst({ where: { id:dto.voucherId, companyId:dto.companyId } });
          if (!voucher) throw new NotFoundException('Comprobante vinculado no encontrado.');
          const direction = operationTypes[dto.kind].section === 'compras' ? 'COMPRA' : dto.kind === 'EXPORTACION' ? 'VENTA' : null;
          if (direction !== voucher.direccion) throw new BadRequestException('El comprobante vinculado no corresponde al tipo de operación.');
          const date = voucher.direccion === 'COMPRA' ? voucher.fechaRegistroAts ?? voucher.fechaEmision : voucher.fechaEmision;
          if (date.getUTCFullYear() !== dto.anio || date.getUTCMonth() + 1 !== dto.mes) throw new BadRequestException('El comprobante vinculado pertenece a otro período contable.');
          if (dto.data.autorizacion !== voucher.claveAcceso) throw new BadRequestException('La autorización debe coincidir con el comprobante vinculado.');
        }
        const data = { companyId:dto.companyId, mes:dto.mes, anio:dto.anio, kind:dto.kind, reference:dto.reference, identity,
          voucherId:dto.voucherId ?? null, data:dto.data as Prisma.InputJsonValue, actorId:userId };
        let record;
        let previous;
        if (dto.id) {
          previous = await tx.atsOperation.findFirst({ where:{id:dto.id, companyId:dto.companyId} });
          if (!previous) throw new NotFoundException('Operación no encontrada.');
          if (previous.mes !== dto.mes || previous.anio !== dto.anio) throw new BadRequestException('No se puede trasladar una operación a otro período al editarla.');
          const updated = await tx.atsOperation.updateMany({ where:{id:dto.id, companyId:dto.companyId, version:dto.version ?? -1}, data:{...data,version:{increment:1}} });
          if (!updated.count) throw new ConflictException('La operación cambió. Recarga antes de editar.');
          record = await tx.atsOperation.findUniqueOrThrow({ where:{id:dto.id} });
        } else record = await tx.atsOperation.create({data});
        await this.audit.registrar({ userId,companyId:dto.companyId,accion:'GUARDAR_OPERACION_ATS',modulo:'ATS',registroId:record.id,
          valorAnterior:previous?.data,valorNuevo:{kind:dto.kind,reference:dto.reference,data:dto.data},resultado:'OK' },tx);
        return record;
      });
    } catch (error) {
      if ((error as any).code === 'P2002') throw new ConflictException('Este documento o comprobante vinculado ya tiene una operación ATS en el período.');
      throw error;
    }
  }

  async removeOperation(companyId: string, id: string, version: number, userId: string) {
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}), 0)`;
      const previous = await tx.atsOperation.findFirst({ where:{id,companyId} });
      if (!previous) throw new NotFoundException('Operación no encontrada.');
      await assertPeriodOpen(tx, companyId, [new Date(Date.UTC(previous.anio, previous.mes - 1, 1))]);
      const result = await tx.atsOperation.deleteMany({ where:{id,companyId,version} });
      if (!result.count) throw new ConflictException('La operación cambió. Recarga antes de eliminar.');
      await this.audit.registrar({ userId,companyId,accion:'ELIMINAR_OPERACION_ATS',modulo:'ATS',registroId:id,valorAnterior:previous.data,resultado:'OK' },tx);
      return { eliminado:true };
    });
  }

  async guardarRevision(dto: AtsReviewDto, userId: string) {
    const { companyId, voucherId, ...datos } = dto;
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}), 0)`;
      const anterior = await tx.voucher.findFirst({ where: { id: voucherId, companyId } });
      if (!anterior) throw new NotFoundException('Comprobante no encontrado.');
      const fechaRegistro = dto.fechaRegistro ? new Date(dto.fechaRegistro + 'T00:00:00.000Z') : undefined;
      if (fechaRegistro && (anterior.direccion !== 'COMPRA' || !Number.isFinite(fechaRegistro.getTime()) || fechaRegistro.toISOString().slice(0,10) !== dto.fechaRegistro || dto.fechaRegistro! < anterior.fechaEmision.toISOString().slice(0,10)))
        throw new BadRequestException('La fecha contable solo aplica a compras y no puede ser anterior a la emisión.');
      await assertPeriodOpen(tx, companyId, [anterior.fechaEmision, anterior.fechaRegistroAts ?? anterior.fechaEmision, fechaRegistro ?? anterior.fechaEmision]);
      await tx.voucher.update({ where: { id: voucherId }, data: { ...(fechaRegistro ? { fechaRegistroAts: fechaRegistro } : {}), atsRevision: { ...datos, revisadoPor: userId, fecha: new Date().toISOString() } } });
      await this.audit.registrar({ userId, companyId, modulo: 'ATS', accion: 'REVISAR_COMPROBANTE_ATS',
        registroId: voucherId, valorAnterior: anterior.atsRevision, valorNuevo: datos, resultado: 'OK' }, tx);
      return { guardado: true };
    });
  }

  async obtenerDetalle(companyId: string, mes: number, anio: number) {
    if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(anio) || anio < 2000 || anio > 2100)
      throw new BadRequestException('Período inválido.');
    return this.prisma.voucher.findMany({
      where: { companyId, OR: [
        { direccion: 'COMPRA', fechaRegistroAts: { gte: new Date(Date.UTC(anio,mes-1,1)), lt: new Date(Date.UTC(anio,mes,1)) } },
        { OR: [{ direccion: { not: 'COMPRA' } }, { fechaRegistroAts: null }], fechaEmision: { gte: new Date(Date.UTC(anio,mes-1,1)), lt: new Date(Date.UTC(anio,mes,1)) } },
      ] },
      orderBy: { fechaEmision: 'asc' },
    });
  }

  private vincular(vouchers: any[], errores: ErrorValidacionAts[]) {
    const result = new Map<string, Linked[]>();
    for (const ret of vouchers.filter(v => ['RETENCION_EMITIDA','RETENCION_RECIBIDA'].includes(v.direccion))) {
      const soportes = source(ret).retenciones;
      if (!soportes.length) errores.push({ campo: ret.id, mensaje: 'La retención no contiene documentos de sustento legibles.' });
      for (const soporte of soportes) {
        const candidates = vouchers.filter(v =>
          v.direccion === (ret.direccion === 'RETENCION_EMITIDA' ? 'COMPRA' : 'VENTA') &&
          numberDoc(v) === soporte.numeroDocumento && codigoDocumentoSri(v.tipoComprobante) === soporte.codigoDocumento &&
          (ret.direccion === 'RETENCION_EMITIDA' ? v.rucEmisor === ret.identificacionContraparte : v.identificacionContraparte === ret.rucEmisor) &&
          (!soporte.autorizacionDocumento || soporte.autorizacionDocumento === v.claveAcceso));
        if (candidates.length !== 1) {
          errores.push({ campo: ret.id, mensaje: 'No se puede enlazar de forma inequívoca el sustento ' + soporte.numeroDocumento + '. Importa y concilia el documento del período; no se omitirán retenciones.' });
          continue;
        }
        for (const imp of soporte.impuestos) {
          if (![imp.base,imp.valor,imp.porcentaje].every(n => Number.isFinite(n) && n >= 0) ||
              !['1','2'].includes(imp.codigo) || (imp.codigo === '2' && !camposIva[String(imp.porcentaje)]))
            errores.push({ campo: ret.id, mensaje: 'Código, porcentaje o importe de retención no soportado. Requiere revisión.' });
        }
        const id = candidates[0].id;
        if (ret.direccion === 'RETENCION_EMITIDA' && ret.fechaEmision.toISOString().slice(0,10) < (candidates[0].fechaRegistroAts ?? candidates[0].fechaEmision).toISOString().slice(0,10))
          errores.push({ campo: ret.id, mensaje: 'La retención es anterior al registro contable del sustento. Revisa las fechas.' });
        result.set(id, [...(result.get(id) ?? []), { voucher: ret, soporte }]);
      }
    }
    return result;
  }

  private bases(v: any) {
    const f = source(v);
    return { no: f.baseNoObjeto ?? 0, exenta: f.baseExenta ?? 0, ice: f.montoIce ?? 0,
      cero: f.base0 ?? v.baseImponibleIva0, gravada: f.baseGravada ?? v.baseImponibleIva, iva: v.montoIva };
  }

  async validar(companyId: string, mes: number, anio: number, snapshot?: { company:any; vouchers:any[]; operations:any[] }) {
    const company = snapshot?.company ?? await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada.');
    const vouchers = snapshot?.vouchers ?? await this.obtenerDetalle(companyId, mes, anio);
    const operations = snapshot?.operations ?? await this.operations(companyId, mes, anio);
    const replaced = new Set(operations.map(o => o.voucherId).filter(Boolean));
    const errores: ErrorValidacionAts[] = [];
    const advertencias: ErrorValidacionAts[] = [{ campo: 'alcance', mensaje: 'Concilia los comprobantes y operaciones complementarias con tus registros. La validación estructural no equivale a aceptación del SRI ni confirma por sí sola los catálogos y tratamientos tributarios.' }];
    if (!/^\d{10}001$/.test(company.ruc)) errores.push({ campo: 'company.ruc', mensaje: 'RUC del informante incompatible con el XSD.' });
    if (company.realizaOperacionesExterior === true && !operations.some(o => ['IMPORTACION','EXPORTACION','COMPRA_ESPECIAL'].includes(o.kind))) advertencias.push({ campo:'exterior', mensaje:'El perfil indica operaciones con el exterior, pero no hay registros complementarios en este período. Confirma que no falten operaciones.' });
    for (const operation of operations) {
      try { await validateOperation(operation.kind, operation.data as any, mes, anio); }
      catch (error) { errores.push({ campo:operation.id,mensaje:(error as Error).message }); }
      const d = operation.data as any;
      if (!operation.voucherId && vouchers.some(v => ['COMPRA','VENTA'].includes(v.direccion) && v.claveAcceso === d.autorizacion))
        errores.push({ campo:operation.id,mensaje:'Vincula el comprobante importado que tiene esta autorización para evitar duplicarlo.' });
    }
    if (!vouchers.length) advertencias.push({ campo: 'periodo', mensaje: 'No hay comprobantes en este período.' });
    const links = this.vincular(vouchers, errores);
    for (const operation of operations.filter(o => o.voucherId)) {
      const voucher = vouchers.find(v => v.id === operation.voucherId);
      if (!voucher) errores.push({ campo:operation.id, mensaje:'El comprobante vinculado ya no pertenece al período. Revisa la operación.' });
      const retained = links.get(operation.voucherId!) ?? [];
      const data = operation.data as any;
      if (retained.length) {
        if (operationTypes[operation.kind].section !== 'compras') {
          errores.push({ campo:operation.id,mensaje:'La exportación tiene retenciones importadas. Requiere conciliar su tratamiento antes de generar el ATS.' });
          continue;
        }
        const taxes = retained.flatMap(r => r.soporte.impuestos);
        for (const [rate,field] of Object.entries(camposIva)) {
          const expected = taxes.filter(t => t.codigo === '2' && String(t.porcentaje) === rate).reduce((s,t) => s.plus(t.valor),decimal(0));
          if (!expected.equals(data[field] ?? 0)) errores.push({campo:operation.id,mensaje:'La retención importada no coincide con ' + field});
        }
        const signature = (rows:any[]) => rows.map(r => [r.codigoRetencion ?? r.codRetAir,decimal(r.base ?? r.baseImpAir).toFixed(2),decimal(r.porcentaje ?? r.porcentajeAir).toFixed(2),decimal(r.valor ?? r.valRetAir).toFixed(2)].join('|')).sort().join(';');
        if (signature(taxes.filter(t => t.codigo === '1')) !== signature(data.air?.detalleAir ?? [])) errores.push({campo:operation.id,mensaje:'Las retenciones de renta no coinciden con los sustentos importados.'});
        if (retained.length > 2 || retained.some((r,i) => data['autRetencion'+(i+1)] !== r.voucher.claveAcceso)) errores.push({campo:operation.id,mensaje:'Revisa las autorizaciones de las retenciones vinculadas.'});
      }
    }
    for (const v of vouchers) {
      if (replaced.has(v.id)) continue;
      const f = source(v), rev = revision(v);
      if (!/^\d{49}$/.test(v.claveAcceso)) errores.push({ campo: v.id, mensaje: 'Se requiere clave de acceso de 49 dígitos; no se inventará autorización ni numeración.' });
      if (v.direccion === 'NO_RELACIONADO') errores.push({ campo: v.id, mensaje: 'Comprobante no relacionado. Revisa su emisor y destinatario.' });
      if (!['VENTA','COMPRA'].includes(v.direccion)) continue;
      if (!codigoDocumentoSri(v.tipoComprobante)) errores.push({ campo: v.id, mensaje: 'Tipo de comprobante no soportado por este generador.' });
      if (!rev.operacionLocal || !['SI','NO'].includes(rev.parteRelacionada)) errores.push({ campo: v.id, mensaje: 'Confirma la operación local y las partes relacionadas en Revisar datos ATS.' });
      if (v.direccion === 'COMPRA' && !/^\d{2}$/.test(rev.codSustento ?? '')) errores.push({ campo: v.id, mensaje: 'Falta confirmar el código de sustento tributario; ya no se asigna 01 por defecto.' });
      const pagos = rev.pagos?.length ? rev.pagos : f.pagos;
      if (v.tipoComprobante !== 'NOTA_CREDITO' && !pagos.length) errores.push({ campo: v.id, mensaje: 'Falta la forma de pago.' });
      const b = this.bases(v);
      if (Object.values(b).some(n => !Number.isFinite(Number(n)) || Number(n) < 0)) errores.push({ campo: v.id, mensaje: 'Bases o impuestos inválidos.' });
      if (decimal(b.no).plus(b.exenta).plus(b.cero).plus(b.gravada).lte(0)) errores.push({ campo: v.id, mensaje: 'La base del comprobante debe ser positiva.' });
      if (v.tipoComprobante === 'NOTA_CREDITO' && v.direccion === 'COMPRA' &&
        (!/^\d{15}$/.test(f.numeroModificado) || !f.codigoModificado || !/^\d{3,49}$/.test(rev.autorizacionModificado ?? '')))
        errores.push({ campo: v.id, mensaje: 'La nota de crédito requiere documento modificado y su autorización confirmada.' });
      if ((links.get(v.id) ?? []).length > 2 && v.direccion === 'COMPRA') errores.push({ campo: v.id, mensaje: 'Más de dos retenciones por compra requieren tratamiento específico del ATS.' });
    }
    return { errores, advertencias };
  }

  async generarXml(companyId: string, mes: number, anio: number, userId: string) {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const vouchers = await this.obtenerDetalle(companyId, mes, anio);
    const operations = await this.operations(companyId, mes, anio);
    const { errores, advertencias } = await this.validar(companyId, mes, anio, {company,vouchers,operations});
    if (errores.length) throw new BadRequestException({ message: 'Corrige los datos ATS antes de generar.', errores });
    const replaced = new Set(operations.map(o => o.voucherId).filter(Boolean));
    const linkingErrors: ErrorValidacionAts[] = [];
    const links = this.vincular(vouchers, linkingErrors);
    if (linkingErrors.length) throw new BadRequestException('Los comprobantes cambiaron. Vuelve a validar.');
    const compras = vouchers.filter(v => v.direccion === 'COMPRA' && !replaced.has(v.id)), ventas = vouchers.filter(v => v.direccion === 'VENTA' && !replaced.has(v.id));
    const totalVentas = ventas.reduce((s,v) => { const b = this.bases(v); return s.plus(decimal(b.no).plus(b.exenta).plus(b.cero).plus(b.gravada).times(v.tipoComprobante === 'NOTA_CREDITO' ? -1 : 1)); }, decimal(0));
    const doc = create({ version: '1.0', encoding: 'UTF-8' }).ele('iva');
    const put = (node: any, key: string, value: any) => node.ele(key).txt(String(value)).up();
    put(doc,'TipoIDInformante','R'); put(doc,'IdInformante',company.ruc); put(doc,'razonSocial',company.razonSocial.slice(0,300));
    put(doc,'Anio',anio); put(doc,'Mes',String(mes).padStart(2,'0'));
    put(doc,'numEstabRuc',String(Math.max(await this.prisma.establishment.count({ where: { companyId } }),1)).padStart(3,'0'));
    put(doc,'totalVentas',totalVentas.toFixed(2)); put(doc,'codigoOperativo','IVA');
    const comprasEl = doc.ele('compras');
    for (const c of compras) {
      const f = source(c), rev = revision(c), b = this.bases(c), linked = links.get(c.id) ?? [];
      const proveedor = c.tipoComprobante === 'LIQUIDACION' ? c.identificacionContraparte! : c.rucEmisor;
      const d = comprasEl.ele('detalleCompras');
      put(d,'codSustento',rev.codSustento); put(d,'tpIdProv',tipoIdentificacionAts(proveedor,false,c.tipoComprobante === 'LIQUIDACION' ? f.tipoIdentificacion : undefined));
      put(d,'idProv',proveedor); put(d,'tipoComprobante',codigoDocumentoSri(c.tipoComprobante)); put(d,'parteRel',rev.parteRelacionada);
      put(d,'fechaRegistro',fecha(c.fechaRegistroAts ?? c.fechaEmision)); put(d,'establecimiento',c.claveAcceso.slice(24,27));
      put(d,'puntoEmision',c.claveAcceso.slice(27,30)); put(d,'secuencial',c.claveAcceso.slice(30,39));
      put(d,'fechaEmision',fecha(c.fechaEmision)); put(d,'autorizacion',c.claveAcceso);
      for (const [key,val] of Object.entries({ baseNoGraIva:b.no, baseImponible:b.cero, baseImpGrav:b.gravada, baseImpExe:b.exenta, montoIce:b.ice, montoIva:b.iva })) put(d,key,decimal(val).toFixed(2));
      const imps = linked.flatMap(l => l.soporte.impuestos);
      for (const [pct,field] of Object.entries(camposIva)) put(d,field,imps.filter(i => i.codigo === '2' && String(i.porcentaje) === pct).reduce((s,i) => s.plus(i.valor),decimal(0)).toFixed(2));
      const exterior = d.ele('pagoExterior'); put(exterior,'pagoLocExt','01'); put(exterior,'aplicConvDobTrib','NA'); put(exterior,'pagExtSujRetNorLeg','NA');
      const pagos = rev.pagos?.length ? rev.pagos : f.pagos;
      if (pagos.length) { const p = d.ele('formasDePago'); pagos.forEach((v:string) => put(p,'formaPago',v)); }
      const renta = imps.filter(i => i.codigo === '1');
      if (renta.length) { const air = d.ele('air'); renta.forEach(i => { const r=air.ele('detalleAir'); put(r,'codRetAir',i.codigoRetencion); put(r,'baseImpAir',decimal(i.base).toFixed(2)); put(r,'porcentajeAir',decimal(i.porcentaje).toFixed(2)); put(r,'valRetAir',decimal(i.valor).toFixed(2)); }); }
      linked.forEach((l,i) => { const n=i+1, clave=l.voucher.claveAcceso; put(d,'estabRetencion'+n,clave.slice(24,27)); put(d,'ptoEmiRetencion'+n,clave.slice(27,30)); put(d,'secRetencion'+n,clave.slice(30,39)); put(d,'autRetencion'+n,clave); put(d,'fechaEmiRet'+n,fecha(l.voucher.fechaEmision)); });
      if (c.tipoComprobante === 'NOTA_CREDITO') { put(d,'docModificado',f.codigoModificado); put(d,'estabModificado',f.numeroModificado.slice(0,3)); put(d,'ptoEmiModificado',f.numeroModificado.slice(3,6)); put(d,'secModificado',f.numeroModificado.slice(6)); put(d,'autModificado',rev.autorizacionModificado); }
    }
    for (const operation of operations.filter(o => operationTypes[o.kind].section === 'compras')) {
      appendFields(comprasEl.ele('detalleCompras'), operationSchema(operation.kind).fields, operation.data as any);
    }
    const ventasEl = doc.ele('ventas'), grupos = new Map<string, typeof ventas>();
    for (const v of ventas) {
      const key=JSON.stringify([v.identificacionContraparte,v.tipoComprobante,source(v).tipoIdentificacion,revision(v).parteRelacionada]);
      grupos.set(key,[...(grupos.get(key) ?? []),v]);
    }
    for (const group of grupos.values()) {
      const v=group[0], d=ventasEl.ele('detalleVentas');
      put(d,'tpIdCliente',tipoIdentificacionAts(v.identificacionContraparte ?? '',true,source(v).tipoIdentificacion)); put(d,'idCliente',v.identificacionContraparte);
      put(d,'parteRelVtas',revision(v).parteRelacionada); put(d,'tipoComprobante',codigoDocumentoSri(v.tipoComprobante));
      put(d,'tipoEmision','E'); put(d,'numeroComprobantes',group.length);
      const sum=(k:keyof ReturnType<AtsService['bases']>) => group.reduce((s,item) => s.plus(this.bases(item)[k]),decimal(0)).toFixed(2);
      put(d,'baseNoGraIva',group.reduce((s,item) => { const b=this.bases(item); return s.plus(b.no).plus(b.exenta); },decimal(0)).toFixed(2));
      put(d,'baseImponible',sum('cero')); put(d,'baseImpGrav',sum('gravada')); put(d,'montoIva',sum('iva')); put(d,'montoIce',sum('ice'));
      const imps=group.flatMap(item => (links.get(item.id) ?? []).flatMap(l => l.soporte.impuestos));
      put(d,'valorRetIva',imps.filter(i=>i.codigo==='2').reduce((s,i)=>s.plus(i.valor),decimal(0)).toFixed(2));
      put(d,'valorRetRenta',imps.filter(i=>i.codigo==='1').reduce((s,i)=>s.plus(i.valor),decimal(0)).toFixed(2));
      const pagos=[...new Set<string>(group.flatMap(item => revision(item).pagos?.length ? revision(item).pagos : source(item).pagos))];
      if (pagos.length) { const p=d.ele('formasDePago'); pagos.forEach(v=>put(p,'formaPago',v)); }
    }
    for (const section of ['exportaciones','recap','fideicomisos','anulados','rendFinancieros']) {
      const records = operations.filter(o => operationTypes[o.kind].section === section);
      if (!records.length) continue;
      const node = doc.ele(section);
      for (const record of records) {
        const schema = operationSchema(record.kind);
        appendFields(node.ele(schema.element), schema.fields, record.data as any);
      }
    }
    const xml=doc.end({prettyPrint:true});
    await validarXsd(xml);
    const hashArchivo=createHash('sha256').update(xml).digest('hex');
    const data={ usuarioId:userId, versionCatalogo:'ATS-operaciones-revision-2026-10-31', versionXsd:'ats.xsd-SRI', estado:'VALIDADO_XSD_REVISADO', hashArchivo,
      advertenciasJson:advertencias.map(a=>({...a})), fechaGeneracion:new Date() };
    const reporte=await this.prisma.atsReport.upsert({ where:{companyId_mes_anio:{companyId,mes,anio}}, create:{companyId,mes,anio,...data}, update:data });
    await this.audit.registrar({ userId,companyId,accion:'GENERAR_ATS',modulo:'ATS',registroId:reporte.id,resultado:'OK' });
    return {xml,reporte,advertencias};
  }

  async historial(companyId:string) { return this.prisma.atsReport.findMany({where:{companyId},orderBy:[{anio:'desc'},{mes:'desc'}]}); }
}
