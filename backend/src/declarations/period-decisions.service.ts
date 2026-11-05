import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PeriodDecisionDto } from './period-decision.dto';
import { assertPeriodOpen } from './period-lock';
import { taxSource } from './tax-source';

@Injectable()
export class PeriodDecisionsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  async history(companyId: string, voucherId: string) {
    const voucher = await this.prisma.voucher.findFirst({ where: { id: voucherId, companyId } });
    if (!voucher) throw new NotFoundException('Comprobante no encontrado.');
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const source = taxSource(company, [voucher], [], '');
    const history = await this.prisma.periodDecision.findMany({ where: { companyId, voucherId }, orderBy: { version: 'asc' },
      include: { actor: { select: { nombre: true } } } });
    return { sourceHash: source.fingerprint, document: source.snapshot.documents[0], history,
      stale: history.length > 0 && history[history.length - 1].sourceHash !== source.fingerprint,
      changesTaxCalculation: false };
  }
  async save(dto: PeriodDecisionDto, actorId: string) {
    if (dto.justification.trim().length < 10 || dto.evidence.trim().length < 5)
      throw new BadRequestException('Indica justificación y referencia documental.');
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.companyId}), 0)`;
      const voucher = await tx.voucher.findFirst({ where: { id: dto.voucherId, companyId: dto.companyId } });
      if (!voucher) throw new NotFoundException('Comprobante no encontrado.');
      if (voucher.direccion !== 'COMPRA') throw new BadRequestException('Esta conciliación corresponde a compras.');
      await assertPeriodOpen(tx, dto.companyId, [voucher.fechaEmision, voucher.fechaRegistroAts ?? voucher.fechaEmision]);
      const company = await tx.company.findUniqueOrThrow({ where: { id: dto.companyId } });
      const source = taxSource(company, [voucher], [], '');
      if (source.fingerprint !== dto.sourceHash) throw new ConflictException('La fuente cambió. Recarga antes de decidir.');
      const last = await tx.periodDecision.findFirst({ where: { companyId: dto.companyId, voucherId: dto.voucherId }, orderBy: { version: 'desc' } });
      if ((last?.version ?? 0) !== dto.previousVersion) throw new ConflictException('Otra persona registró una decisión. Recarga el historial.');
      const doc = source.snapshot.documents[0];
      if (doc.emissionPeriod === doc.atsPeriod) throw new BadRequestException('El comprobante no tiene diferencias de período.');
      const decision = await tx.periodDecision.create({ data: {
        companyId: dto.companyId, voucherId: dto.voucherId, version: dto.previousVersion + 1, choice: dto.choice,
        proposedPeriod: dto.choice === 'PENDIENTE' ? null : dto.choice === 'EMISION' ? doc.emissionPeriod : doc.atsPeriod,
        justification: dto.justification.trim(), evidence: dto.evidence.trim(), sourceHash: source.fingerprint,
        sourceSnapshot: JSON.parse(JSON.stringify(source.snapshot)), actorId,
      } });
      await this.audit.registrar({ userId: actorId, companyId: dto.companyId, accion: 'PROPONER_PERIODO_IVA', modulo: 'DECLARATIONS',
        registroId: decision.id, valorNuevo: { version: decision.version, choice: decision.choice, changesTaxCalculation: false }, resultado: 'OK' }, tx);
      return { decision, changesTaxCalculation: false, message: 'Propuesta documentada. No cambia fechas ni liquidaciones; requiere integración y revisión tributaria.' };
    });
  }
}
