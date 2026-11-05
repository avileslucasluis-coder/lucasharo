import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { PermissionsGuard } from '../rbac/permissions.guard';

@Global()
@Module({
  providers: [AuditService, PermissionsGuard],
  controllers: [AuditController],
  exports: [AuditService],
})
export class AuditModule {}
