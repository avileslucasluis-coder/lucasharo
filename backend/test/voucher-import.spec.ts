import { Prisma } from '@prisma/client';
import { VouchersService } from '../src/vouchers/vouchers.service';
import * as parser from '../src/vouchers/xml-parser.util';

describe('Importación concurrente', () => {
  afterEach(() => jest.restoreAllMocks());

  it('devuelve un conflicto de entrada controlado cuando otro proceso importó la misma clave', async () => {
    jest.spyOn(parser, 'parseComprobanteXml').mockReturnValue({ claveAcceso: 'clave', fechaEmision: new Date('2026-10-01Z') } as any);
    const error = new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5.22.0' });
    const prisma: any = {
      company: { findUnique: jest.fn().mockResolvedValue({ ruc: '0999999999001' }) },
      voucher: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockRejectedValue(error) },
    };
    const audit = { registrar: jest.fn() };
    prisma.$executeRaw = jest.fn();
    prisma.taxDeclaration = { count: jest.fn().mockResolvedValue(0) };
    prisma.$transaction = (fn: any) => fn(prisma);
    await expect(new VouchersService(prisma, audit as any).importarXml('empresa', '<xml/>', 'usuario'))
      .rejects.toMatchObject({ status: 400 });
    expect(audit.registrar).not.toHaveBeenCalled();
  });
});
