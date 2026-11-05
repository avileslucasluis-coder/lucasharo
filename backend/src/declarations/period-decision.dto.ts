import { IsIn, IsInt, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';
export class PeriodDecisionDto {
  @IsUUID() companyId!: string;
  @IsUUID() voucherId!: string;
  @IsInt() @Min(0) previousVersion!: number;
  @Matches(/^[a-f0-9]{64}$/) sourceHash!: string;
  @IsIn(['EMISION', 'REGISTRO', 'PENDIENTE']) choice!: string;
  @IsString() @MinLength(10) @MaxLength(1000) justification!: string;
  @IsString() @MinLength(5) @MaxLength(500) evidence!: string;
}
