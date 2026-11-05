import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { jwtSecret } from '../security/config';
import { AuthRateGuard } from '../security/auth-rate.guard';
import { PasswordRecoveryService } from './password-recovery.service';
import { RecoveryMailService } from './recovery-mail.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: jwtSecret(config.get<string>('JWT_SECRET')),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, AuthRateGuard, PasswordRecoveryService, RecoveryMailService],
  controllers: [AuthController, AdminController],
  exports: [AuthService],
})
export class AuthModule {}
