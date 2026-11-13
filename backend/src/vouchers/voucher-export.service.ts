import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { voucherExcel } from './voucher-excel';

@Injectable()
export class VoucherExportService {
  constructor(private readonly prisma: PrismaService) {}

  async excel(companyId: string, year: number, month?: number) {
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || month !== undefined && (!Number.isInteger(month) || month < 1 || month > 12)) {
      throw new BadRequestException('Selecciona un año entre 2000 y 2100 y un mes válido, o el consolidado anual.');
    }
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada.');
    const vouchers = await this.prisma.voucher.findMany({
      where: { companyId, fechaEmision: { gte: new Date(Date.UTC(year, month ? month - 1 : 0, 1)), lt: new Date(Date.UTC(month ? year : year + 1, month ?? 0, 1)) } },
      orderBy: [{ fechaEmision: 'asc' }, { id: 'asc' }], take: 10001,
    });
    if (vouchers.length > 10000) throw new BadRequestException('Este período supera los 10000 comprobantes. Exporta por mes.');
    const result = await voucherExcel(company, vouchers, year, month);
    if (result.content.length > 3 * 1024 * 1024) throw new BadRequestException('El Excel excede el tamaño de descarga. Exporta un período más corto.');
    return {
      filename: `consolidado_${company.ruc}_${year}${month ? '_' + String(month).padStart(2, '0') : '_anual'}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      contentBase64: result.content.toString('base64'), pendientes: result.pendientes, comprobantes: result.comprobantes,
    };
  }
}
