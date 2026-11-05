import { Module } from '@nestjs/common';
import { TaxRulesService } from './tax-rules.service';
import { TaxRulesController } from './tax-rules.controller';
import { PermissionsGuard } from '../rbac/permissions.guard';

@Module({
  providers: [TaxRulesService, PermissionsGuard],
  controllers: [TaxRulesController],
  exports: [TaxRulesService],
})
export class TaxRulesModule {}
