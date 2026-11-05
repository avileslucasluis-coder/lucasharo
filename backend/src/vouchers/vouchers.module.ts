import { Module } from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { VouchersController } from './vouchers.controller';
import { PermissionsGuard } from '../rbac/permissions.guard';

@Module({
  providers: [VouchersService, PermissionsGuard],
  controllers: [VouchersController],
  exports: [VouchersService],
})
export class VouchersModule {}
