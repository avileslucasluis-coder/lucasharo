import { Module } from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { VouchersController } from './vouchers.controller';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { SriClientService } from '../sri/sri-client.service';
import { VoucherExportService } from './voucher-export.service';

@Module({
  providers: [VouchersService, VoucherExportService, PermissionsGuard, SriClientService],
  controllers: [VouchersController],
  exports: [VouchersService],
})
export class VouchersModule {}
