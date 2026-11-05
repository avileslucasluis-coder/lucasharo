import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCompanyDto } from './dto/company.dto';
import { TaxProfileDto } from './dto/tax-profile.dto';

@Injectable()
export class CompaniesService {
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
