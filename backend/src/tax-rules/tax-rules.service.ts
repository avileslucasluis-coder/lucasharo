import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegimenGeneralRules } from './regimenes/regimen-general.rules';
import { RimpeEmprendedorRules } from './regimenes/rimpe-emprendedor.rules';
import { RimpeNegocioPopularRules } from './regimenes/rimpe-negocio-popular.rules';
import { novenoDigito } from './reglas-comunes';
import { Obligacion, PerfilTributario } from './types';
import { DeadlineDto } from './deadline.dto';
import { AuditService } from '../audit/audit.service';

/// Punto único de entrada del motor de reglas: recibe una empresa y un
/// periodo, arma su PerfilTributario a partir de lo guardado en BD, elige
/// el archivo de reglas del régimen correspondiente (nunca una regla
/// codificada aquí mismo), y persiste el resultado en
/// `tax_obligations` para que quede como historial verificable.
///
/// Agregar un nuevo régimen es: crear su archivo en `regimenes/` + un
/// `case` más en el switch de abajo — el resto del sistema no cambia.
@Injectable()
export class TaxRulesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async revisarVencimiento(dto: DeadlineDto, userId: string) {
    const fecha = new Date(dto.fecha + 'T12:00:00.000Z');
    if (!Number.isFinite(fecha.getTime()) || fecha.toISOString().slice(0,10) !== dto.fecha || Math.abs(fecha.getUTCFullYear() - dto.anio) > 1)
      throw new BadRequestException('Fecha de vencimiento inválida para el ejercicio.');
    return this.prisma.$transaction(async tx => {
      const record = await tx.taxObligationInstance.findUnique({ where: { companyId_mes_anio_tipo: { companyId: dto.companyId, mes: dto.mes, anio: dto.anio, tipo: dto.tipo } } });
      if (!record) throw new NotFoundException('Consulta primero las obligaciones del período.');
      const revision = { fecha: dto.fecha, fuente: dto.fuente, motivo: dto.motivo, actorId: userId, revisadoEn: new Date().toISOString() };
      await tx.taxObligationInstance.update({ where: { id: record.id }, data: { revisionVencimiento: revision } });
      await this.audit.registrar({ userId, companyId: dto.companyId, accion: 'REVISAR_VENCIMIENTO', modulo: 'TAX', registroId: record.id,
        valorAnterior: record.revisionVencimiento, valorNuevo: revision, resultado: 'OK' }, tx);
      return { guardado: true };
    });
  }

  async evaluarObligaciones(companyId: string, mes: number, anio: number): Promise<Obligacion[]> {
    if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      throw new BadRequestException('Período inválido: mes del 1 al 12 y año entre 2000 y 2100.');
    }
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada.');

    const perfil: PerfilTributario = {
      regimen: company.regimen as PerfilTributario['regimen'],
      obligadoLlevarContabilidad: company.obligadoLlevarContabilidad ?? undefined,
      esContribuyenteEspecial: company.esContribuyenteEspecial ?? undefined,
      designadoAgenteRetencionPorSri: company.esAgenteRetencion ?? undefined,
      realizaVentasGravadasIva: company.realizaVentasGravadasIva ?? undefined,
      realizaVentasTarifa0: company.realizaVentasTarifa0 ?? undefined,
      realizaOperacionesExterior: company.realizaOperacionesExterior ?? undefined,
      superaFraccionBasicaRenta: company.superaFraccionBasicaRenta ?? undefined,
      realizaActividadesExcluidasRimpe: company.realizaActividadesExcluidasRimpe ?? undefined,
      tipoPersona: (company.tipoPersona ?? undefined) as PerfilTributario['tipoPersona'],
      periodicidadIvaDeclarada: (company.periodicidadIvaDeclarada ?? undefined) as PerfilTributario['periodicidadIvaDeclarada'],
      deberesFormalesRegistrados: new Set(company.deberesFormalesRegistrados),
    };

    const ruc9 = novenoDigito(company.ruc);

    let obligaciones: Obligacion[];
    switch (perfil.regimen) {
      case 'GENERAL':
        obligaciones = RegimenGeneralRules.evaluar(perfil, ruc9, mes, anio);
        break;
      case 'RIMPE_EMPRENDEDOR':
        obligaciones = RimpeEmprendedorRules.evaluar(perfil, ruc9, mes, anio);
        break;
      case 'RIMPE_NEGOCIO_POPULAR':
        obligaciones = RimpeNegocioPopularRules.evaluar(perfil, ruc9, mes, anio);
        break;
      default:
        throw new NotFoundException(`Régimen no soportado: ${perfil.regimen}`);
    }

    const revisadas = await this.prisma.taxObligationInstance.findMany({ where: { companyId, mes, anio } });
    obligaciones = obligaciones.map(o => {
      const revision = revisadas.find(r => r.tipo === o.tipo)?.revisionVencimiento as { fecha?: string; fuente?: string; motivo?: string } | null;
      if (revision?.fecha && o.fechaVencimiento && o.estado !== 'NO_OBLIGADO') return {
        ...o, fechaVencimiento: new Date(revision.fecha + 'T12:00:00.000Z'),
        motivo: `${o.motivo} Fecha revisada manualmente para esta empresa: ${revision.motivo}. Fuente: ${revision.fuente}`,
      };
      return o.fechaVencimiento ? {
      ...o,
      motivo: `${o.motivo} Fecha ordinaria referencial: verifica feriados nacionales/locales y ampliaciones del SRI.`,
      } : o;
    });

    await Promise.all(
      obligaciones.map((o) =>
        this.prisma.taxObligationInstance.upsert({
          where: { companyId_mes_anio_tipo: { companyId, mes, anio, tipo: o.tipo } },
          create: {
            companyId,
            mes,
            anio,
            tipo: o.tipo,
            formulario: o.formulario,
            periodicidad: o.periodicidad,
            estado: o.estado,
            motivo: o.motivo,
            baseLegal: o.baseLegal,
            fechaVencimiento: o.fechaVencimiento,
          },
          update: {
            formulario: o.formulario,
            periodicidad: o.periodicidad,
            estado: o.estado,
            motivo: o.motivo,
            baseLegal: o.baseLegal,
            fechaVencimiento: o.fechaVencimiento,
          },
        }),
      ),
    );

    return obligaciones;
  }
}
