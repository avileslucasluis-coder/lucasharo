import { ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, ValidateIf } from 'class-validator';

export class TaxProfileDto {
  @IsOptional()
  @IsBoolean()
  realizaVentasGravadasIva?: boolean | null;

  @IsOptional()
  @IsBoolean()
  realizaVentasTarifa0?: boolean | null;

  @IsOptional()
  @IsBoolean()
  realizaOperacionesExterior?: boolean | null;

  @IsOptional()
  @IsBoolean()
  superaFraccionBasicaRenta?: boolean | null;

  @IsOptional()
  @IsBoolean()
  realizaActividadesExcluidasRimpe?: boolean | null;

  @IsOptional()
  @IsBoolean()
  obligadoLlevarContabilidad?: boolean | null;

  @IsOptional()
  @IsBoolean()
  esContribuyenteEspecial?: boolean | null;

  @IsOptional()
  @IsBoolean()
  esAgenteRetencion?: boolean | null;

  @IsOptional()
  @IsIn(['NATURAL', 'SOCIEDAD'])
  tipoPersona?: 'NATURAL' | 'SOCIEDAD' | null;

  @IsOptional()
  @IsIn(['MENSUAL', 'SEMESTRAL'])
  periodicidadIvaDeclarada?: 'MENSUAL' | 'SEMESTRAL' | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @IsIn(['IVA', 'RETENCIONES EN LA FUENTE', 'ATS', 'IMPUESTO A LA RENTA'], { each: true })
  deberesFormalesRegistrados?: string[];
}
