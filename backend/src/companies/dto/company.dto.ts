import { IsBoolean, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class DeleteCompanyDto {
  @IsString() @Matches(/^\d{13}$/)
  confirmarRuc!: string;
}

export class CreateCompanyDto {
  @IsString()
  @Length(13, 13, { message: 'El RUC debe tener 13 dígitos.' })
  @Matches(/^\d{13}$/, { message: 'El RUC debe contener 13 dígitos.' })
  ruc!: string;

  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Length(1, 200)
  razonSocial!: string;

  @IsOptional()
  @IsString()
  nombreComercial?: string;

  @IsIn(['GENERAL', 'RIMPE_EMPRENDEDOR', 'RIMPE_NEGOCIO_POPULAR'])
  regimen!: string;

  @IsOptional()
  @IsString()
  actividadEconomica?: string;

  @IsOptional()
  @IsBoolean()
  obligadoLlevarContabilidad?: boolean;

  @IsOptional()
  @IsBoolean()
  esContribuyenteEspecial?: boolean;

  @IsOptional()
  @IsBoolean()
  esAgenteRetencion?: boolean;

  @IsOptional() @IsString() @MaxLength(300)
  direccion?: string;

  @IsOptional() @IsString() @MaxLength(30)
  telefono?: string;
}
