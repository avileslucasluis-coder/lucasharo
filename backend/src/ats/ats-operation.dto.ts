import { IsUUID, IsInt, Min, Max, IsIn, IsString, MinLength, MaxLength, IsObject, ValidateIf } from 'class-validator';
export class AtsOperationDto {
  @IsUUID() companyId!: string;
  @ValidateIf((_,v) => v !== undefined) @IsUUID() id?: string;
  @ValidateIf((_,v) => v !== undefined) @IsUUID() voucherId?: string;
  @ValidateIf((_,v) => v !== undefined) @IsInt() @Min(1) version?: number;
  @IsInt() @Min(1) @Max(12) mes!: number;
  @IsInt() @Min(2000) @Max(2100) anio!: number;
  @IsIn(['IMPORTACION','EXPORTACION','REEMBOLSO','COMPRA_ESPECIAL','ANULADO','RECAP','FIDEICOMISO','RENDIMIENTO']) kind!: string;
  @IsString() @MinLength(10) @MaxLength(1000) reference!: string;
  @IsObject() data!: Record<string, any>;
}
