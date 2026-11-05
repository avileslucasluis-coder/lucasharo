import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsBase64, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { SriService } from './sri.service';

class CompanyDto { @IsUUID() companyId!: string; }
class FirmaDto extends CompanyDto {
  @IsString() @IsNotEmpty() @MaxLength(327680) xml!: string;
  @IsBase64() @MaxLength(1400000) certificadoP12!: string;
  @IsString() @MaxLength(1024) clave!: string;
}

@ApiTags('SRI — ambiente configurado en el servidor')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/sri')
export class SriController {
  constructor(private readonly sri: SriService) {}

  @Get('documents') @RequirePermissions('sri.operar')
  listar(@Query() query: CompanyDto) { return this.sri.listar(query.companyId); }

  @Get('documents/:id') @RequirePermissions('sri.operar')
  detalle(@Query() query: CompanyDto, @Param('id') id: string) { return this.sri.detalle(query.companyId, id); }

  @Post('prepare') @RequirePermissions('sri.operar')
  preparar(@Body() dto: FirmaDto, @CurrentUser() user: { userId: string }, @Req() req: Request) {
    const remoto = req.socket.remoteAddress;
    if (!req.secure && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoto ?? '')) {
      throw new BadRequestException('La firma requiere una conexión HTTPS o acceso local al servidor.');
    }
    return this.sri.preparar(dto.companyId, dto.xml, dto.certificadoP12, dto.clave, user.userId);
  }

  @Post('documents/:id/send') @RequirePermissions('sri.operar')
  enviar(@Body() dto: CompanyDto, @Param('id') id: string, @CurrentUser() user: { userId: string }) {
    return this.sri.enviar(dto.companyId, id, user.userId);
  }

  @Post('documents/:id/authorization') @RequirePermissions('sri.operar')
  consultar(@Body() dto: CompanyDto, @Param('id') id: string, @CurrentUser() user: { userId: string }) {
    return this.sri.consultar(dto.companyId, id, user.userId);
  }
}
