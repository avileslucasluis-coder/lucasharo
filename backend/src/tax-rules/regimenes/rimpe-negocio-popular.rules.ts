import { Obligacion, PerfilTributario } from '../types';
import { vencimientoRentaAnual, vencimientoSemestral, vencimientoAts } from '../reglas-comunes';

/// RIMPE Negocio Popular: régimen pensado para los negocios más pequeños.
/// Por defecto NO emite facturas con IVA discriminado (usa notas de venta
/// RIMPE) y NO es agente de retención — el motor nunca asume 103/104/ATS
/// solo por pertenecer a este régimen; siempre exige que el dato esté
/// registrado explícitamente (deber formal del RUC) antes de marcarlo
/// obligatorio.
/// Vigencia: normativa 2026. Los casos en que un Negocio Popular sí declara
/// IVA/ATS son puntuales (deber formal explícito) — REQUIERE VERIFICACIÓN
/// OFICIAL DEL SRI para cada caso concreto, el motor solo puede resolverlo
/// con certeza cuando esa información viene del RUC.
export class RimpeNegocioPopularRules {
  static evaluar(perfil: PerfilTributario, ruc9: number | null, mes: number, anio: number): Obligacion[] {
    return [this.iva(perfil, ruc9, mes, anio), this.retenciones(perfil), this.ats(perfil, ruc9, mes, anio), this.renta(ruc9, anio)];
  }

  private static iva(perfil: PerfilTributario, ruc9: number | null, mes: number, anio: number): Obligacion {
    if (perfil.deberesFormalesRegistrados.has('IVA') || perfil.realizaActividadesExcluidasRimpe) {
      return {
        id: 'rimpe_np_iva',
        nombre: 'Impuesto al Valor Agregado (IVA)',
        tipo: 'IVA',
        formulario: '104',
        periodicidad: 'SEMESTRAL',
        estado: 'OBLIGATORIO',
        motivo: 'Existe deber formal de IVA o actividades excluidas del RIMPE; estas actividades requieren declaración semestral de IVA.',
        baseLegal: 'Deberes formales del RUC (SRI en Línea).',
        fechaVencimiento: vencimientoSemestral({ novenoDigito: ruc9, mesPeriodo: mes, anioPeriodo: anio }),
      };
    }

    return {
      id: 'rimpe_np_iva',
      nombre: 'Impuesto al Valor Agregado (IVA)',
      tipo: 'IVA',
      formulario: null,
      periodicidad: 'NO_APLICA',
      estado: 'NO_OBLIGADO',
      motivo:
        'No corresponde según sus condiciones: un Negocio Popular emite notas de venta RIMPE sin desglosar IVA y, por defecto, no declara el Formulario 104.',
      baseLegal: 'Régimen RIMPE — LORTI (reformada). REQUIERE VERIFICACIÓN OFICIAL DEL SRI si el RUC tuviera un deber formal distinto.',
      fechaVencimiento: null,
    };
  }

  private static retenciones(perfil: PerfilTributario): Obligacion {
    if (perfil.deberesFormalesRegistrados.has('RETENCIONES EN LA FUENTE')) {
      return {
        id: 'rimpe_np_retenciones',
        nombre: 'Retenciones en la Fuente',
        tipo: 'RETENCIONES',
        formulario: '103',
        periodicidad: 'MENSUAL',
        estado: 'PENDIENTE_INFORMACION',
        motivo: 'El deber formal indicado contradice la categoría Negocio Popular, cuyos integrantes no actúan como agentes de retención. Verifica el RUC y la categoría vigente.',
        baseLegal: 'Deberes formales del RUC (SRI en Línea).',
        fechaVencimiento: null,
      };
    }

    return {
      id: 'rimpe_np_retenciones',
      nombre: 'Retenciones en la Fuente',
      tipo: 'RETENCIONES',
      formulario: null,
      periodicidad: 'NO_APLICA',
      estado: 'NO_OBLIGADO',
      motivo: 'No corresponde: un Negocio Popular no actúa como agente de retención por defecto.',
      baseLegal: 'LORTI, Art. 45 y 50; régimen RIMPE.',
      fechaVencimiento: null,
    };
  }

  private static ats(perfil: PerfilTributario, ruc9: number | null, mes: number, anio: number): Obligacion {
    if (
      perfil.deberesFormalesRegistrados.has('ATS') ||
      perfil.deberesFormalesRegistrados.has('ANEXO TRANSACCIONAL SIMPLIFICADO')
    ) {
      return {
        id: 'rimpe_np_ats',
        nombre: 'Anexo Transaccional Simplificado (ATS)',
        tipo: 'ATS',
        formulario: 'ATS',
        periodicidad: 'SEMESTRAL',
        estado: 'OBLIGATORIO',
        motivo: 'El RUC tiene registrado el deber formal del ATS.',
        baseLegal: 'Deberes formales del RUC (SRI en Línea).',
        fechaVencimiento: vencimientoAts({ novenoDigito: ruc9, mesPeriodo: mes, anioPeriodo: anio, periodicidad: 'SEMESTRAL' }),
      };
    }

    return {
      id: 'rimpe_np_ats',
      nombre: 'Anexo Transaccional Simplificado (ATS)',
      tipo: 'ATS',
      formulario: null,
      periodicidad: 'NO_APLICA',
      estado: 'NO_OBLIGADO',
      motivo: 'No obligado: como Negocio Popular sin deber formal de ATS registrado, no está dentro de los sujetos obligados.',
      baseLegal: 'Resolución NAC-DGERCGC — Presentación del ATS.',
      fechaVencimiento: null,
    };
  }

  private static renta(ruc9: number | null, anioFiscal: number): Obligacion {
    return {
      id: 'rimpe_np_renta',
      nombre: 'Impuesto a la Renta (cuota RIMPE Negocio Popular)',
      tipo: 'RENTA',
      formulario: 'Impuesto a la Renta Personas Naturales',
      periodicidad: 'ANUAL',
      estado: 'OBLIGATORIO',
      motivo: 'Declara anualmente según sus ingresos brutos, en mayo del año siguiente al ejercicio fiscal.',
      baseLegal: 'Régimen RIMPE — LORTI (reformada), tabla de cuotas para Negocio Popular.',
      fechaVencimiento: vencimientoRentaAnual({ novenoDigito: ruc9, anioFiscal, mesVencimiento: 5 }),
    };
  }
}
