import { Module } from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { VouchersController } from './vouchers.controller';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { SriClientService } from '../sri/sri-client.service';

@Module({
  providers: [VouchersService, PermissionsGuard, SriClientService],
  controllers: [VouchersController],
  exports: [VouchersService],
})
export class VouchersModule {}
