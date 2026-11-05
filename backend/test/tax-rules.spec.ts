import { RegimenGeneralRules } from '../src/tax-rules/regimenes/regimen-general.rules';
import { RimpeEmprendedorRules } from '../src/tax-rules/regimenes/rimpe-emprendedor.rules';
import { RimpeNegocioPopularRules } from '../src/tax-rules/regimenes/rimpe-negocio-popular.rules';
import { PerfilTributario } from '../src/tax-rules/types';

describe('Motor de obligaciones tributarias', () => {
  describe('RIMPE Negocio Popular', () => {
    it('NO marca 103/104/ATS como obligatorio sin un deber formal explícito', () => {
      const perfil: PerfilTributario = {
        regimen: 'RIMPE_NEGOCIO_POPULAR',
        deberesFormalesRegistrados: new Set(),
      };
      const obligaciones = RimpeNegocioPopularRules.evaluar(perfil, 3, 8, 2026);

      const iva = obligaciones.find((o) => o.tipo === 'IVA')!;
      const retenciones = obligaciones.find((o) => o.tipo === 'RETENCIONES')!;
      const ats = obligaciones.find((o) => o.tipo === 'ATS')!;
      const renta = obligaciones.find((o) => o.tipo === 'RENTA')!;

      expect(iva.estado).toBe('NO_OBLIGADO');
      expect(retenciones.estado).toBe('NO_OBLIGADO');
      expect(ats.estado).toBe('NO_OBLIGADO');
      expect(renta.estado).toBe('OBLIGATORIO'); // la Renta anual siempre aplica
    });

    it('SÍ marca IVA obligatorio si el RUC tiene ese deber formal registrado', () => {
      const perfil: PerfilTributario = {
        regimen: 'RIMPE_NEGOCIO_POPULAR',
        deberesFormalesRegistrados: new Set(['IVA']),
      };
      const iva = RimpeNegocioPopularRules.evaluar(perfil, 3, 8, 2026).find((o) => o.tipo === 'IVA')!;
      expect(iva.estado).toBe('OBLIGATORIO');
      expect(iva.formulario).toBe('104');
    });
  });

  describe('RIMPE Emprendedor', () => {
    it('IVA semestral por defecto en RIMPE Emprendedor', () => {
      const perfil: PerfilTributario = {
        regimen: 'RIMPE_EMPRENDEDOR',
        realizaVentasGravadasIva: true,
        deberesFormalesRegistrados: new Set(),
      };
      const iva = RimpeEmprendedorRules.evaluar(perfil, 5, 8, 2026).find((o) => o.tipo === 'IVA')!;
      expect(iva.estado).toBe('OBLIGATORIO');
      expect(iva.periodicidad).toBe('SEMESTRAL');
      expect(iva.formulario).toBe('104');
    });

    it('Retenciones queda PENDIENTE_INFORMACION cuando no se sabe si es agente de retención', () => {
      const perfil: PerfilTributario = {
        regimen: 'RIMPE_EMPRENDEDOR',
        realizaVentasGravadasIva: true,
        deberesFormalesRegistrados: new Set(),
      };
      const retenciones = RimpeEmprendedorRules.evaluar(perfil, 5, 8, 2026).find((o) => o.tipo === 'RETENCIONES')!;
      expect(retenciones.estado).toBe('PENDIENTE_INFORMACION');
    });

    it('Retenciones es NO_OBLIGADO cuando se confirma que no es agente ni opera al exterior', () => {
      const perfil: PerfilTributario = {
        regimen: 'RIMPE_EMPRENDEDOR',
        designadoAgenteRetencionPorSri: false,
        realizaOperacionesExterior: false,
        deberesFormalesRegistrados: new Set(),
      };
      const retenciones = RimpeEmprendedorRules.evaluar(perfil, 5, 8, 2026).find((o) => o.tipo === 'RETENCIONES')!;
      expect(retenciones.estado).toBe('NO_OBLIGADO');
    });
  });

  describe('Régimen General', () => {
    it('nunca inventa un dato: sin información responde PENDIENTE_INFORMACION, no OBLIGATORIO ni NO_OBLIGADO', () => {
      const perfil: PerfilTributario = {
        regimen: 'GENERAL',
        deberesFormalesRegistrados: new Set(),
      };
      const obligaciones = RegimenGeneralRules.evaluar(perfil, 5, 8, 2026);
      const iva = obligaciones.find((o) => o.tipo === 'IVA')!;
      const retenciones = obligaciones.find((o) => o.tipo === 'RETENCIONES')!;
      const ats = obligaciones.find((o) => o.tipo === 'ATS')!;

      expect(iva.estado).toBe('PENDIENTE_INFORMACION');
      expect(retenciones.estado).toBe('PENDIENTE_INFORMACION');
      expect(ats.estado).toBe('PENDIENTE_INFORMACION');
    });

    it('calcula la fecha de vencimiento mensual según el noveno dígito del RUC', () => {
      const perfil: PerfilTributario = {
        regimen: 'GENERAL',
        realizaVentasGravadasIva: true,
        deberesFormalesRegistrados: new Set(),
      };
      const iva = RegimenGeneralRules.evaluar(perfil, 1, 8, 2026).find((o) => o.tipo === 'IVA')!;
      // noveno dígito 1 -> vence el día 10 del mes siguiente
      expect(iva.fechaVencimiento?.getDate()).toBe(10);
      expect(iva.fechaVencimiento?.getMonth()).toBe(8); // setiembre (0-indexado)
    });

    it('un deber formal explícito de IVA manda por encima de la inferencia por defecto', () => {
      const perfil: PerfilTributario = {
        regimen: 'GENERAL',
        realizaVentasGravadasIva: false,
        deberesFormalesRegistrados: new Set(['IVA']),
      };
      const iva = RegimenGeneralRules.evaluar(perfil, 5, 8, 2026).find((o) => o.tipo === 'IVA')!;
      expect(iva.estado).toBe('OBLIGATORIO');
    });
  });
});
