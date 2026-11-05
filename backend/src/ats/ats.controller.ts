import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AtsService } from './ats.service';
import { AtsReviewDto } from './ats-review.dto';
import { AtsOperationDto } from './ats-operation.dto';

class RemoveOperationDto {
  @IsUUID() companyId!: string;
  @IsUUID() id!: string;
  @IsInt() @Min(1) version!: number;
}

class AtsPeriodoDto {
  @IsUUID()
  companyId!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  mes!: number;

  @IsInt()
  @Min(2000)
  @Max(2100)
  anio!: number;
}

@ApiTags('ats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/ats')
export class AtsController {
  @Get('operation-schemas')
  @RequirePermissions('ats.validar')
  schemas() { return this.ats.schemas(); }

  @Get('operations')
  @RequirePermissions('ats.validar')
  operations(@Query('companyId') companyId:string, @Query('mes') mes:string, @Query('anio') anio:string) {
    return this.ats.operations(companyId,Number(mes),Number(anio));
  }

  @Post('operations')
  @RequirePermissions('ats.generate')
  saveOperation(@Body() dto:AtsOperationDto, @CurrentUser() user:{userId:string}) { return this.ats.saveOperation(dto,user.userId); }

  @Post('operations/remove')
  @RequirePermissions('ats.generate')
  removeOperation(@Body() dto:RemoveOperationDto, @CurrentUser() user:{userId:string}) { return this.ats.removeOperation(dto.companyId,dto.id,dto.version,user.userId); }
  @Get('review')
  @RequirePermissions('ats.validar')
  revisar(@Query('companyId') companyId: string, @Query('mes') mes: string, @Query('anio') anio: string) {
    return this.ats.obtenerDetalle(companyId, Number(mes), Number(anio));
  }

  @Post('review')
  @RequirePermissions('ats.generate')
  guardarRevision(@Body() dto: AtsReviewDto, @CurrentUser() user: { userId: string }) {
    return this.ats.guardarRevision(dto, user.userId);
  }
  constructor(private readonly ats: AtsService) {}

  @Post('validate')
  @RequirePermissions('ats.validar')
  validar(@Body() dto: AtsPeriodoDto) {
    return this.ats.validar(dto.companyId, dto.mes, dto.anio);
  }

  @Post('generate')
  @RequirePermissions('ats.generate')
  generar(@Body() dto: AtsPeriodoDto, @CurrentUser() user: { userId: string }) {
    return this.ats.generarXml(dto.companyId, dto.mes, dto.anio, user.userId);
  }

  @Get('history')
  @RequirePermissions('ats.validar')
  historial(@Query('companyId') companyId: string) {
    return this.ats.historial(companyId);
  }
}
