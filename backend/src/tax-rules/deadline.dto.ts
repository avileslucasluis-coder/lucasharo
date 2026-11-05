import { IsUUID, IsInt, Min, Max, IsIn, Matches, IsString, MinLength, MaxLength } from 'class-validator';
export class DeadlineDto {
  @IsUUID() companyId!: string;
  @IsInt() @Min(1) @Max(12) mes!: number;
  @IsInt() @Min(2000) @Max(2100) anio!: number;
  @IsIn(['IVA','RETENCIONES','ATS','RENTA']) tipo!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) fecha!: string;
  @IsString() @MaxLength(2000) @Matches(/^https:\/\/(www\.)?sri\.gob\.ec\//) fuente!: string;
  @IsString() @MinLength(10) @MaxLength(1000) motivo!: string;
}
