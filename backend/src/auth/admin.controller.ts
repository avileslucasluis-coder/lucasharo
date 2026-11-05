import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RecoveryMailService } from './recovery-mail.service';

class AccountStatusDto {
  @IsBoolean()
  activo!: boolean;
}

class AdminRoleDto {
  @IsBoolean()
  platformAdmin!: boolean;
}

export class AccountProfileDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(160)
  nombre!: string;

  @Matches(/^(?:[0-9]{10}|[0-9]{13})$/, { message: 'Ingresa una cédula de 10 dígitos o un RUC de 13 dígitos.' })
  ruc!: string;
}

@Controller('api/admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  @Post('users/:id/profile')
  async changeProfile(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AccountProfileDto) {
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(290003)`;
        const admin = await tx.user.findUnique({ where: { id: req.user.userId } });
        if (!admin?.activo || !admin.platformAdmin) throw new ForbiddenException('Acceso reservado al administrador.');
        if (id === admin.id) throw new BadRequestException('Esta opción permite editar otras cuentas.');
        const target = await tx.user.findUnique({ where: { id } });
        if (!target) throw new NotFoundException('Cuenta no encontrada.');
        const identityChanged = target.ruc !== dto.ruc;
        if (!identityChanged && target.nombre === dto.nombre) return { id, nombre: target.nombre, ruc: target.ruc };
        const updated = await tx.user.update({ where: { id }, data: {
          nombre: dto.nombre, ruc: dto.ruc, ...(identityChanged ? { sessionVersion: { increment: 1 } } : {}),
        }, select: { id: true, nombre: true, ruc: true } });
        if (identityChanged) await tx.refreshToken.updateMany({ where: { userId: id }, data: { revocado: true } });
        await tx.auditLog.create({ data: { userId: admin.id, registroId: id, modulo: 'ADMIN', resultado: 'OK',
          accion: 'EDITAR_DATOS_CUENTA', valorAnterior: { nombre: target.nombre, ruc: target.ruc },
          valorNuevo: { nombre: dto.nombre, ruc: dto.ruc } } });
        return updated;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe una cuenta con esa cédula o RUC.');
      }
      throw error;
    }
  }
  @Post('users/:id/admin-role')
  async changeAdminRole(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminRoleDto) {
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(290003)`;
      const admin = await tx.user.findUnique({ where: { id: req.user.userId } });
      if (!admin?.activo || !admin.platformAdmin) throw new ForbiddenException('Acceso reservado al administrador.');
      if (id === admin.id) throw new BadRequestException('No puedes cambiar tu propio rol administrativo.');
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw new NotFoundException('Cuenta no encontrada.');
      if (!target.activo && dto.platformAdmin) throw new BadRequestException('Activa la cuenta antes de designarla administradora.');
      if (target.platformAdmin === dto.platformAdmin) return { platformAdmin: target.platformAdmin };
      await tx.user.update({ where: { id }, data: { platformAdmin: dto.platformAdmin, sessionVersion: { increment: 1 } } });
      await tx.refreshToken.updateMany({ where: { userId: id }, data: { revocado: true } });
      await tx.auditLog.create({ data: {
        userId: admin.id, registroId: id, modulo: 'ADMIN', resultado: 'OK',
        accion: dto.platformAdmin ? 'OTORGAR_ADMINISTRADOR' : 'RETIRAR_ADMINISTRADOR',
        valorAnterior: { platformAdmin: target.platformAdmin }, valorNuevo: { platformAdmin: dto.platformAdmin },
      } });
      return { platformAdmin: dto.platformAdmin };
    });
  }
  constructor(private readonly prisma: PrismaService, private readonly mail: RecoveryMailService) {}

  private async authorize(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.activo || !user.platformAdmin) throw new ForbiddenException('Acceso reservado al administrador.');
  }

  @Get('status')
  async status(@Req() req: any) {
    await this.authorize(req.user.userId);
    let mailConfigured = false;
    try { this.mail.checkConfiguration(); mailConfigured = true; } catch {}
    return { mailConfigured, currentUserId: req.user.userId };
  }

  @Get('users')
  async users(@Req() req: any) {
    await this.authorize(req.user.userId);
    return this.prisma.user.findMany({ take: 100, orderBy: { createdAt: 'desc' },
      select: { id: true, nombre: true, email: true, ruc: true, activo: true, platformAdmin: true } });
  }

  @Post('users/:id/status')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: AccountStatusDto) {
    return this.prisma.$transaction(async tx => {
      // Serializa las operaciones administrativas; nunca permite desactivar administradores.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(290003)`;
      const admin = await tx.user.findUnique({ where: { id: req.user.userId } });
      if (!admin?.activo || !admin.platformAdmin) throw new ForbiddenException();
      const changed = await tx.user.updateMany({ where: { id, platformAdmin: false },
        data: { activo: dto.activo, sessionVersion: { increment: 1 } } });
      if (changed.count !== 1) throw new ForbiddenException('No se puede modificar esta cuenta.');
      await tx.refreshToken.updateMany({ where: { userId: id }, data: { revocado: true } });
      await tx.auditLog.create({ data: { userId: admin.id, accion: dto.activo ? 'ACTIVAR_USUARIO' : 'DESACTIVAR_USUARIO',
        modulo: 'ADMIN', resultado: 'OK', registroId: id } });
      return { activo: dto.activo };
    });
  }
}
