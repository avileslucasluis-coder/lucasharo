import { Module } from '@nestjs/common';
import { SignatureService } from '../signature/signature.service';
import { SriClientService } from './sri-client.service';
import { SriController } from './sri.controller';
import { SriService } from './sri.service';

@Module({ providers: [SignatureService, SriClientService, SriService], controllers: [SriController] })
export class SriModule {}
