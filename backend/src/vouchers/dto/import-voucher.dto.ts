import { IsString, IsUUID, IsIn, MaxLength, Matches } from 'class-validator';

export class CompleteSriDto {
  @IsUUID() companyId!: string;
  @IsString() @Matches(/^\d{49}$/) claveAcceso!: string;
}

export class ImportVoucherDto {
  @IsUUID()
  companyId!: string;

  @IsString()
  xmlContent!: string;
}

export class ImportTxtDto {
  @IsUUID() companyId!: string;
  @IsString() @MaxLength(10000000) txtContent!: string;
  @IsIn(['RECIBIDOS', 'EMITIDOS']) sentido!: 'RECIBIDOS' | 'EMITIDOS';
}
