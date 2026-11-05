import { IsEmail, IsString, MinLength, MaxLength, Matches, ValidateIf, IsOptional } from 'class-validator';

export class RegisterDto {
  @Matches(/^(?:[0-9]{10}|[0-9]{13})$/, { message: 'Ingresa una cédula de 10 dígitos o un RUC de 13 dígitos.' })
  ruc!: string;
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener entre 8 y 10 caracteres.' })
  @MaxLength(10, { message: 'La contraseña debe tener entre 8 y 10 caracteres.' })
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nombre!: string;
}

export class LoginDto {
  @ValidateIf(o => o.ruc !== undefined || o.email === undefined)
  @Matches(/^(?:[0-9]{10}|[0-9]{13})$/)
  ruc?: string;

  @ValidateIf(o => o.email !== undefined || o.ruc === undefined)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsString()
  @MaxLength(128)
  password!: string;
}

export class RefreshDto {
  @IsString()
  @MaxLength(256)
  refreshToken!: string;
}

export class CompleteIdentityDto {
  @Matches(/^(?:[0-9]{10}|[0-9]{13})$/, { message: 'Ingresa una cédula de 10 dígitos o un RUC de 13 dígitos.' })
  ruc!: string;
}

export class ForgotPasswordDto {
  @IsEmail() @MaxLength(254)
  email!: string;
}

export class ResetPasswordDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/)
  token!: string;
  @IsString() @MinLength(8, { message: 'La contraseña debe tener entre 8 y 10 caracteres.' }) @MaxLength(10, { message: 'La contraseña debe tener entre 8 y 10 caracteres.' })
  password!: string;
}
