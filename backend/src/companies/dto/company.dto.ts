import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @Length(13, 13, { message: 'El RUC debe tener 13 dígitos.' })
  ruc!: string;

  @IsString()
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
}
