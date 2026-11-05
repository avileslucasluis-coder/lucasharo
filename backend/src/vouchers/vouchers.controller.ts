import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { VouchersService } from './vouchers.service';
import { ImportVoucherDto, ImportTxtDto } from './dto/import-voucher.dto';

@ApiTags('vouchers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/vouchers')
export class VouchersController {
  constructor(private readonly vouchers: VouchersService) {}

  @Post('import')
  @RequirePermissions('comprobantes.importar')
  importar(@Body() dto: ImportVoucherDto, @CurrentUser() user: { userId: string }) {
    return this.vouchers.importarXml(dto.companyId, dto.xmlContent, user.userId);
  }

  @Post('import-txt')
  @RequirePermissions('comprobantes.importar')
  importarTxt(@Body() dto: ImportTxtDto, @CurrentUser() user: { userId: string }) {
    return this.vouchers.importarTxt(dto.companyId, dto.txtContent, dto.sentido, user.userId);
  }

  @Get()
  @RequirePermissions('obligaciones.ver')
  listar(
    @Query('companyId') companyId: string,
    @Query('mes') mes?: string,
    @Query('anio') anio?: string,
  ) {
    return this.vouchers.listar(companyId, mes !== undefined ? Number(mes) : undefined, anio !== undefined ? Number(anio) : undefined);
  }
}
