import { Module } from '@nestjs/common';
import { AtsService } from './ats.service';
import { AtsController } from './ats.controller';
import { PermissionsGuard } from '../rbac/permissions.guard';

@Module({
  providers: [AtsService, PermissionsGuard],
  controllers: [AtsController],
  exports: [AtsService],
})
export class AtsModule {}
