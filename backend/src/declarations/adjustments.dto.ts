import { IsString, Matches, MaxLength, MinLength, ValidateIf, IsIn, IsInt, Min, IsUUID, IsISO8601, IsBase64 } from 'class-validator';

export class AdjustmentsDto {
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,9}(\.\d{1,2})?$/)
  ivaSinDerechoCredito?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,9}(\.\d{1,2})?$/)
  creditoAnteriorCompras?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,9}(\.\d{1,2})?$/)
  creditoAnteriorRetenciones?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,9}(\.\d{1,2})?$/)
  ajusteCreditoCompras?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,9}(\.\d{1,2})?$/)
  ajusteCreditoRetenciones?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,9}(\.\d{1,2})?$/)
  multa104?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,9}(\.\d{1,2})?$/)
  interes104?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,9}(\.\d{1,2})?$/)
  multa103?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,9}(\.\d{1,2})?$/)
  interes103?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,9}(\.\d{1,2})?$/)
  ingresosBrutos?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,9}(\.\d{1,2})?$/)
  devolucionesDescuentos?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,9}(\.\d{1,2})?$/)
  ingresosExentos?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,9}(\.\d{1,2})?$/)
  gastosDeducibles?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,9}(\.\d{1,2})?$/)
  ajustesAumentan?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,9}(\.\d{1,2})?$/)
  ajustesDisminuyen?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,9}(\.\d{1,2})?$/)
  rebajaGastosPersonales?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,9}(\.\d{1,2})?$/)
  retencionesRenta?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,9}(\.\d{1,2})?$/)
  creditoAnteriorRenta?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,9}(\.\d{1,2})?$/)
  anticiposRenta?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,9}(\.\d{1,2})?$/)
  multaRenta?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,9}(\.\d{1,2})?$/)
  interesRenta?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,9}(\.\d{1,2})?$/)
  tarifaSociedad?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^(0(\.\d{1,6})?|1(\.0{1,6})?)$/)
  factorCredito?: string;
  @ValidateIf((_, v) => v !== undefined)
  @IsString() @MaxLength(500)
  fundamentoTarifa?: string;
  @IsString() @MinLength(10) @MaxLength(1000)
  justificacion!: string;
}

export class FilingDto {
  @IsIn(['103', '104', 'RENTA']) formulario!: string;
  @IsUUID() companyId!: string;
  @IsUUID() declarationId!: string;
  @IsInt() @Min(1) revision!: number;
  @IsIn(['PRESENTACION', 'PAGO']) tipo!: string;
  @Matches(/^[A-Za-z0-9._/-]{1,80}$/) numero!: string;
  @IsISO8601({ strict: true }) fecha!: string;
  @Matches(/^\d{1,9}(\.\d{1,2})?$/) valor!: string;
  @IsString() @MinLength(5) @MaxLength(1000) observacion!: string;
  @ValidateIf((_, v) => v !== undefined)
  @IsBase64() @MaxLength(1400000) archivoBase64?: string;
}
