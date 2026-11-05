import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TaxProfileDto } from '../src/companies/dto/tax-profile.dto';
import { TaxRulesService } from '../src/tax-rules/tax-rules.service';

describe('Perfil tributario persistido', () => {
  it('rechaza valores ambiguos y deberes desconocidos', async () => {
    const dto = plainToInstance(TaxProfileDto, {
      realizaVentasGravadasIva: 'false',
      tipoPersona: 'OTRO',
      deberesFormalesRegistrados: ['INVENTADO'],
    });
    expect(await validate(dto)).toHaveLength(3);
  });

  it('permite volver a desconocido sin aceptar una lista nula', async () => {
    expect(await validate(plainToInstance(TaxProfileDto, {
      realizaVentasGravadasIva: null, tipoPersona: null,
    }))).toHaveLength(0);
    expect((await validate(plainToInstance(TaxProfileDto, {
      deberesFormalesRegistrados: null,
    }))).length).toBeGreaterThan(0);
  });

  it('usa los deberes del RUC guardados al evaluar un negocio popular', async () => {
    const prisma = {
      company: { findUnique: jest.fn().mockResolvedValue({
        ruc: '1790012345001', regimen: 'RIMPE_NEGOCIO_POPULAR',
        deberesFormalesRegistrados: ['IVA', 'RETENCIONES EN LA FUENTE'],
      }) },
      taxObligationInstance: { upsert: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
    };
    const result = await new TaxRulesService(prisma as any, {} as any).evaluarObligaciones('company', 10, 2026);
    expect(result.find(o => o.tipo === 'IVA')?.estado).toBe('OBLIGATORIO');
    expect(result.find(o => o.tipo === 'RETENCIONES')?.estado).toBe('PENDIENTE_INFORMACION');
    expect(result.find(o => o.tipo === 'RETENCIONES')?.motivo).toContain('contradice');
  });
});
