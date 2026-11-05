import { IsUUID, Matches, IsIn, IsBoolean, IsArray, ArrayUnique, ValidateIf, MaxLength, IsString, MinLength } from 'class-validator';
export class AtsReviewDto {
  @IsUUID() companyId!: string;
  @IsUUID() voucherId!: string;
  @ValidateIf((_,v) => v !== undefined) @Matches(/^\d{4}-\d{2}-\d{2}$/) fechaRegistro?: string;
  @ValidateIf((_,v) => v !== undefined) @Matches(/^\d{2}$/) codSustento?: string;
  @IsIn(['SI','NO']) parteRelacionada!: string;
  @IsBoolean() operacionLocal!: boolean;
  @IsArray() @ArrayUnique() @Matches(/^\d{2}$/, { each: true }) pagos!: string[];
  @ValidateIf((_,v) => v !== undefined) @Matches(/^\d{3,49}$/) autorizacionModificado?: string;
  @IsString() @MinLength(5) @MaxLength(500) observacion!: string;
}
