import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { TaxRulesModule } from './tax-rules/tax-rules.module';
import { VouchersModule } from './vouchers/vouchers.module';
import { DeclarationsModule } from './declarations/declarations.module';
import { AtsModule } from './ats/ats.module';
import { AuditModule } from './audit/audit.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    AuthModule,
    CompaniesModule,
    TaxRulesModule,
    VouchersModule,
    DeclarationsModule,
    AtsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
