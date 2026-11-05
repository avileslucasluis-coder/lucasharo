import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { DeadlineDto } from './deadline.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { TaxRulesService } from './tax-rules.service';

@ApiTags('tax-obligations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/tax/obligations')
export class TaxRulesController {
  constructor(private readonly taxRules: TaxRulesService) {}

  @Post('deadline')
  @RequirePermissions('empresas.editar_perfil')
  revisar(@Body() dto: DeadlineDto, @CurrentUser() user: { userId: string }) {
    return this.taxRules.revisarVencimiento(dto, user.userId);
  }

  @Get()
  @RequirePermissions('obligaciones.ver')
  evaluar(
    @Query('companyId') companyId: string,
    @Query('mes') mes: string,
    @Query('anio') anio: string,
  ) {
    return this.taxRules.evaluarObligaciones(companyId, Number(mes), Number(anio));
  }
}
