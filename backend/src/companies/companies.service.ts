import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCompanyDto } from './dto/company.dto';
import { TaxProfileDto } from './dto/tax-profile.dto';
import { decryptPdf } from '../security/encrypted-files';
import { gzipSync } from 'node:zlib';

@Injectable()
export class CompaniesService {
  async respaldo(companyId: string) {
    const snapshot = await this.prisma.$transaction(async tx => {
      const company = await tx.company.findUnique({ where: { id: companyId }, include: {
        vouchers: true, withholdings: true, declarations: { include: { revisions: true, filings: true } },
        atsReports: true, atsOperations: true, obligations: true, establishments: true,
        customers: true, suppliers: true, electronicDocuments: true,
        companyUsers: { select: { userId: true, roleId: true, role: { select: { nombre: true } },
          user: { select: { nombre: true, ruc: true } } } },
      } });
      if (!company) throw new NotFoundException('Empresa no encontrada.');
      const decisions = await tx.periodDecision.findMany({ where: { companyId } });
      const audit = await tx.auditLog.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' } });
      return { company, decisions, audit };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
    const declarations = snapshot.company.declarations.map(d => ({ ...d, filings: d.filings.map(f => {
      const { archivoCifrado, ...record } = f;
      return { ...record, archivoPdfBase64: archivoCifrado ? decryptPdf(archivoCifrado) : null };
    }) }));
    const backup = { formato: 'dayanex-empresa', version: 1, exportadoEn: new Date().toISOString(),
      empresa: { ...snapshot.company, declarations }, decisionesPeriodo: snapshot.decisions, auditoria: snapshot.audit };
    const compressed = gzipSync(Buffer.from(JSON.stringify(backup, null, 2), 'utf8'));
    return { filename: `empresa-${snapshot.company.ruc}-${new Date().toISOString().slice(0, 10)}.json.gz`,
      mimeType: 'application/gzip', contentBase64: compressed.toString('base64') };
  }

  async eliminar(companyId: string, confirmarRuc: string, userId: string) {
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}), 0)`;
      await tx.$queryRaw`SELECT id FROM companies WHERE id = ${companyId} FOR UPDATE`;
      const company = await tx.company.findUnique({ where: { id: companyId } });
      if (!company) throw new NotFoundException('Empresa no encontrada.');
      if (confirmarRuc !== company.ruc) throw new ConflictException('Escribe el RUC exacto de la empresa para confirmar su eliminación.');
      // The exception to immutable history is scoped to this transaction and this company.
      await tx.$queryRaw`SELECT set_config('dayanex.deleting_company', ${companyId}, true)`;
      await tx.periodDecision.deleteMany({ where: { companyId } });
      await tx.taxFiling.deleteMany({ where: { declaration: { companyId } } });
      await tx.declarationRevision.deleteMany({ where: { declaration: { companyId } } });
      await tx.atsOperation.deleteMany({ where: { companyId } });
      await tx.auditLog.deleteMany({ where: { companyId } });
      await tx.company.delete({ where: { id: companyId } });
      // Retain only a minimal platform event, without the deleted company's content.
      await this.audit.registrar({ userId, accion: 'ELIMINAR_EMPRESA', modulo: 'COMPANIES',
        registroId: companyId, resultado: 'OK' }, tx);
      return { eliminado: true };
    }, { timeout: 30000 });
  }
  async editar(companyId: string, dto: CreateCompanyDto, userId: string) {
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}), 0)`;
        const anterior = await tx.company.findUnique({ where: { id: companyId }, include: {
          _count: { select: { vouchers: true, declarations: true, atsReports: true, atsOperations: true, electronicDocuments: true, obligations: true } },
        } });
        if (!anterior) throw new NotFoundException('Empresa no encontrada.');
        if (dto.ruc !== anterior.ruc && Object.values(anterior._count).some(count => count > 0)) {
          throw new ConflictException('No se puede cambiar el RUC de una empresa que ya tiene movimientos. Puedes editar sus demás datos.');
        }
        const company = await tx.company.update({ where: { id: companyId }, data: dto });
        await this.audit.registrar({ userId, companyId, accion: 'EDITAR_EMPRESA', modulo: 'COMPANIES',
          registroId: companyId, valorAnterior: anterior, valorNuevo: company, resultado: 'OK' }, tx);
        return company;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe una empresa registrada con ese RUC.');
      }
      throw error;
    }
  }
  async actualizarPerfil(companyId: string, dto: TaxProfileDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}), 0)`;
      const anterior = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const company = await tx.company.update({ where: { id: companyId }, data: dto });
      await this.audit.registrar({
        userId, companyId, accion: 'ACTUALIZAR_PERFIL_TRIBUTARIO',
        modulo: 'COMPANIES', registroId: companyId,
        valorAnterior: anterior, valorNuevo: company, resultado: 'OK',
      }, tx);
      return company;
    });
  }
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /// Lista únicamente las empresas a las que el usuario tiene acceso —
  /// nunca todas las empresas de la plataforma. El aislamiento se aplica
  /// mediante filtros y permisos; no presupone políticas RLS en la base.
  async listarParaUsuario(userId: string) {
    const companyUsers = await this.prisma.companyUser.findMany({
      where: { userId },
      include: { company: true, role: true },
    });
    return companyUsers.map((cu: (typeof companyUsers)[number]) => ({
      ...cu.company,
      miRol: cu.role.nombre,
    }));
  }

  async crear(dto: CreateCompanyDto, creadorUserId: string) {
    const existente = await this.prisma.company.findUnique({ where: { ruc: dto.ruc } });
    if (existente) {
      throw new ConflictException('Ya existe una empresa registrada con ese RUC.');
    }

    const adminRole = await this.prisma.role.findUnique({
      where: { nombre: 'ADMIN_EMPRESA' },
    });
    if (!adminRole) {
      throw new ConflictException(
        'El rol ADMIN_EMPRESA no existe todavía — corre el seed de roles y permisos.',
      );
    }

    const company = await this.prisma.company.create({
      data: {
        ...dto,
        companyUsers: {
          create: { userId: creadorUserId, roleId: adminRole.id },
        },
      },
    });

    await this.audit.registrar({
      userId: creadorUserId,
      companyId: company.id,
      accion: 'CREAR_EMPRESA',
      modulo: 'COMPANIES',
      registroId: company.id,
      valorNuevo: dto,
      resultado: 'OK',
    });

    return company;
  }
}
