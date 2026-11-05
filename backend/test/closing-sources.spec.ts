import { DeclarationsService } from '../src/declarations/declarations.service';

describe('Fuentes inmutables del cierre', () => {
  function fixture() {
    let saved: any;
    const company: any = { id: 'empresa', regimen: 'GENERAL' };
    const operations: any[] = [];
    const decisions: any[] = [];
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      company: { findUniqueOrThrow: jest.fn(async () => company) },
      voucher: { findMany: jest.fn(async () => []) },
      atsOperation: { findMany: jest.fn(async () => operations) },
      periodDecision: { findMany: jest.fn(async () => decisions) },
      taxDeclaration: {
        count: jest.fn(async () => 0), findUnique: jest.fn(async () => saved ?? null),
        upsert: jest.fn(async ({ create }) => saved = { id: 'declaracion', estado: 'BORRADOR', ...create }),
        update: jest.fn(async ({ data }) => saved = { ...saved, ...data }),
      },
      declarationRevision: { findFirst: jest.fn(async () => saved ? { version: 1 } : null), create: jest.fn() },
    };
    const prisma: any = { $transaction: jest.fn(async callback => callback(tx)) };
    const service = new DeclarationsService(prisma, { registrar: jest.fn() } as any);
    const generate = () => service.generarParaPeriodo('empresa', 10, 2026, 'autor', 'MENSUAL', { justificacion: 'Documentos revisados para conciliación' });
    const review = () => service.workflow('empresa', 10, 2026, 'MENSUAL', 'REVISAR', 1, 'Revisión de fuentes completas', 'revisor');
    return { service, tx, prisma, company, operations, decisions, generate, review };
  }
  it('calcula y guarda usando exclusivamente la transacción y conserva el perfil original', async () => {
    const f = fixture();
    const result = await f.generate();
    f.company.regimen = 'RIMPE_EMPRENDEDOR';
    expect((result.liquidacion as any).fuentesCierre.company.regimen).toBe('GENERAL');
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(f.tx.declarationRevision.create).toHaveBeenCalled();
  });
  it.each(['perfil', 'operacion', 'decision'])('rechaza revisión cuando cambia %s después de generar', async kind => {
    const f = fixture();
    await f.generate();
    if (kind === 'perfil') f.company.regimen = 'RIMPE_EMPRENDEDOR';
    if (kind === 'operacion') f.operations.push({ id: 'op', kind: 'IMPORTACION', version: 1 });
    if (kind === 'decision') f.decisions.push({ id: 'decision', version: 1 });
    await expect(f.review()).rejects.toThrow('fuentes tributarias cambiaron');
    expect(f.tx.taxDeclaration.update).not.toHaveBeenCalled();
  });
  it('permite revisar cuando las fuentes siguen iguales', async () => {
    const f = fixture();
    await f.generate();
    const result = await f.review();
    expect(result.estado).toBe('EN_REVISION');
  });
});
