import { Body, Controller, Get, Req, Ip, Post, UseGuards } from '@nestjs/common';
import { AllowIncompleteIdentity, JwtAuthGuard } from './guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuthRateGuard } from '../security/auth-rate.guard';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CompleteIdentityDto, RegisterDto, LoginDto, RefreshDto, ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto';
import { PasswordRecoveryService } from './password-recovery.service';

@ApiTags('auth')
@Controller('api/auth')
@UseGuards(AuthRateGuard)
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly recovery: PasswordRecoveryService, private readonly prisma: PrismaService) {}

  @Get('me')
  @AllowIncompleteIdentity()
  @UseGuards(JwtAuthGuard)
  me(@Req() req: any) {
    return this.prisma.user.findUnique({ where: { id: req.user.userId },
      select: { email: true, ruc: true, nombre: true, platformAdmin: true } });
  }

  @Post('identity')
  @UseGuards(JwtAuthGuard)
  @AllowIncompleteIdentity()
  completeIdentity(@Req() req: any, @Body() dto: CompleteIdentityDto) {
    return this.auth.completeIdentity(req.user.userId, dto.ruc);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) { return this.recovery.request(dto.email); }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) { return this.recovery.reset(dto.token, dto.password); }

  @Post('register')
  @ApiOperation({ summary: 'Crea una cuenta de usuario (sin empresa asociada todavía).' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Inicia sesión y devuelve access + refresh token.' })
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.auth.login(dto, ip);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Rota el refresh token y emite un nuevo access token.' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Revoca el refresh token (cierra la sesión de ese dispositivo).' })
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }
}
