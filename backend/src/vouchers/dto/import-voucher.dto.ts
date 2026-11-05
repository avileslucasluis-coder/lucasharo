import { IsString, IsUUID, IsIn, MaxLength } from 'class-validator';

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
