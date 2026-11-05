import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export function redactAudit(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAudit);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key,
      /password|clave|token|secret|certificado|p12|authorization|cookie|xml|comprobante/i.test(key)
        ? '[REDACTADO]' : redactAudit(item)]),
  );
  return value;
}

export interface RegistroAuditoria {
  userId?: string;
  companyId?: string;
  accion: string;
  modulo: string;
  registroId?: string;
  valorAnterior?: unknown;
  valorNuevo?: unknown;
  ip?: string;
  resultado: 'OK' | 'ERROR';
}

// Guarda los eventos emitidos por los servicios y redacta campos sensibles.
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(evento: RegistroAuditoria, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma).auditLog.create({
      data: {
        userId: evento.userId,
        companyId: evento.companyId,
        accion: evento.accion,
        modulo: evento.modulo,
        registroId: evento.registroId,
        valorAnterior: redactAudit(evento.valorAnterior) as any,
        valorNuevo: redactAudit(evento.valorNuevo) as any,
        ip: evento.ip,
        resultado: evento.resultado,
      },
    });
  }
}
