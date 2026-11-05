import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export async function assertPeriodOpen(tx: Prisma.TransactionClient, companyId: string, dates: Date[]) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}), 0)`;
  const years = [...new Set(dates.map(d => d.getUTCFullYear()))].sort();
  for (const year of years) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}), hashtext(${String(year)}))`;
  }
  for (const date of dates) {
    const month = date.getUTCMonth() + 1;
    const closed = await tx.taxDeclaration.count({ where: { companyId, anio: date.getUTCFullYear(), estado: 'CERRADA', OR: [
      { periodicidad: 'ANUAL' }, { periodicidad: 'MENSUAL', mes: month },
      { periodicidad: 'SEMESTRAL', mes: month <= 6 ? 6 : 12 },
    ] } });
    if (closed) throw new ConflictException('El período está cerrado. Solicita su reapertura justificada antes de modificar comprobantes u operaciones.');
  }
}
