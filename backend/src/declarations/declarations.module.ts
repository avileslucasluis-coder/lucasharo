import { Module } from '@nestjs/common';
import { DeclarationsService } from './declarations.service';
import { DeclarationsController } from './declarations.controller';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { PeriodDecisionsService } from './period-decisions.service';

@Module({
  providers: [DeclarationsService, PeriodDecisionsService, PermissionsGuard],
  controllers: [DeclarationsController],
  exports: [DeclarationsService],
})
export class DeclarationsModule {}
