import { Obligacion, PerfilTributario } from '../types';
import { vencimientoMensual, vencimientoSemestral, vencimientoRentaAnual, vencimientoAts } from '../reglas-comunes';

/// Reglas del Régimen General. Cada función evalúa UNA obligación leyendo
/// solo el PerfilTributario — nunca asume que "Régimen General" implica
/// automáticamente las cuatro obligaciones clásicas.
/// Base legal: LORTI y resoluciones del SRI. Vigencia: normativa 2026.
export class RegimenGeneralRules {
  static evaluar(perfil: PerfilTributario, ruc9: number | null, mes: number, anio: number): Obligacion[] {
    const esEspecial = perfil.esContribuyenteEspecial ?? false;
    return [
      this.iva(perfil, ruc9, esEspecial, mes, anio),
      this.retenciones(perfil, ruc9, esEspecial, mes, anio),
      this.ats(perfil, ruc9, esEspecial, mes, anio),
      this.renta(perfil, ruc9, anio),
    ];
  }

  private static iva(
    perfil: PerfilTributario,
    ruc9: number | null,
    esEspecial: boolean,
    mes: number,
    anio: number,
  ): Obligacion {
    if (perfil.deberesFormalesRegistrados.has('IVA')) {
      return {
        id: 'general_iva',
        nombre: 'Impuesto al Valor Agregado (IVA)',
        tipo: 'IVA',
        formulario: '104',
        periodicidad: 'MENSUAL',
        estado: 'OBLIGATORIO',
        motivo: 'El RUC tiene registrado el deber formal de IVA.',
        baseLegal: 'Deberes formales del RUC (SRI en Línea).',
        fechaVencimiento: vencimientoMensual({ novenoDigito: ruc9, mesPeriodo: mes, anioPeriodo: anio, esContribuyenteEspecial: esEspecial }),
      };
    }

    if (perfil.realizaVentasGravadasIva === undefined && perfil.realizaVentasTarifa0 === undefined) {
      return {
        id: 'general_iva',
        nombre: 'Impuesto al Valor Agregado (IVA)',
        tipo: 'IVA',
        formulario: '104',
        periodicidad: 'SEGUN_CORRESPONDA',
        estado: 'PENDIENTE_INFORMACION',
        motivo:
          'Información insuficiente: falta saber si el contribuyente realiza ventas gravadas con IVA o con tarifa 0%.',
        baseLegal: 'LORTI, Art. 63 y 64.',
        fechaVencimiento: null,
      };
    }

    const tieneActividadIva = (perfil.realizaVentasGravadasIva ?? false) || (perfil.realizaVentasTarifa0 ?? false);
    if (!tieneActividadIva) {
      return {
        id: 'general_iva',
        nombre: 'Impuesto al Valor Agregado (IVA)',
        tipo: 'IVA',
        formulario: '104',
        periodicidad: 'NO_APLICA',
        estado: 'NO_OBLIGADO',
        motivo: 'No corresponde: no realiza actividades gravadas con IVA ni con tarifa 0%.',
        baseLegal: 'LORTI, Art. 63 y 64.',
        fechaVencimiento: null,
      };
    }

    const esMensual = perfil.realizaVentasGravadasIva ?? false;
    return {
      id: 'general_iva',
      nombre: 'Impuesto al Valor Agregado (IVA)',
      tipo: 'IVA',
      formulario: '104',
      periodicidad: esMensual ? 'MENSUAL' : 'SEMESTRAL',
      estado: 'OBLIGATORIO',
      motivo: esMensual
        ? 'Corresponde porque el contribuyente realiza ventas gravadas con IVA.'
        : 'Solo vende con tarifa 0%, por lo que puede declarar el IVA semestralmente.',
      baseLegal: 'LORTI, Art. 67; Resolución de plazos de declaración del SRI.',
      fechaVencimiento: esMensual
        ? vencimientoMensual({ novenoDigito: ruc9, mesPeriodo: mes, anioPeriodo: anio, esContribuyenteEspecial: esEspecial })
        : vencimientoSemestral({ novenoDigito: ruc9, mesPeriodo: mes, anioPeriodo: anio }),
    };
  }

  private static retenciones(
    perfil: PerfilTributario,
    ruc9: number | null,
    esEspecial: boolean,
    mes: number,
    anio: number,
  ): Obligacion {
    if (perfil.deberesFormalesRegistrados.has('RETENCIONES EN LA FUENTE')) {
      return {
        id: 'general_retenciones',
        nombre: 'Retenciones en la Fuente',
        tipo: 'RETENCIONES',
        formulario: '103',
        periodicidad: 'MENSUAL',
        estado: 'OBLIGATORIO',
        motivo: 'El RUC tiene registrado el deber formal de Retenciones en la Fuente.',
        baseLegal: 'Deberes formales del RUC (SRI en Línea).',
        fechaVencimiento: vencimientoMensual({ novenoDigito: ruc9, mesPeriodo: mes, anioPeriodo: anio, esContribuyenteEspecial: esEspecial }),
      };
    }

    const sinDatos =
      perfil.obligadoLlevarContabilidad === undefined &&
      perfil.esContribuyenteEspecial === undefined &&
      perfil.designadoAgenteRetencionPorSri === undefined;
    if (sinDatos) {
      return {
        id: 'general_retenciones',
        nombre: 'Retenciones en la Fuente',
        tipo: 'RETENCIONES',
        formulario: '103',
        periodicidad: 'SEGUN_CORRESPONDA',
        estado: 'PENDIENTE_INFORMACION',
        motivo:
          'Información insuficiente: falta saber si es agente de retención (lleva contabilidad, es contribuyente especial o fue designado por el SRI).',
        baseLegal: 'LORTI, Art. 45 y 50.',
        fechaVencimiento: null,
      };
    }

    const esAgente =
      (perfil.obligadoLlevarContabilidad ?? false) ||
      (perfil.esContribuyenteEspecial ?? false) ||
      (perfil.designadoAgenteRetencionPorSri ?? false);

    if (!esAgente) {
      return {
        id: 'general_retenciones',
        nombre: 'Retenciones en la Fuente',
        tipo: 'RETENCIONES',
        formulario: '103',
        periodicidad: 'NO_APLICA',
        estado: 'NO_OBLIGADO',
        motivo: 'No corresponde: no mantiene obligación de actuar como agente de retención.',
        baseLegal: 'LORTI, Art. 45 y 50.',
        fechaVencimiento: null,
      };
    }

    return {
      id: 'general_retenciones',
      nombre: 'Retenciones en la Fuente',
      tipo: 'RETENCIONES',
      formulario: '103',
      periodicidad: 'MENSUAL',
      estado: 'OBLIGATORIO',
      motivo: 'Corresponde porque actúa como agente de retención.',
      baseLegal: 'LORTI, Art. 45 y 50.',
      fechaVencimiento: vencimientoMensual({ novenoDigito: ruc9, mesPeriodo: mes, anioPeriodo: anio, esContribuyenteEspecial: esEspecial }),
    };
  }

  private static ats(
    perfil: PerfilTributario,
    ruc9: number | null,
    esEspecial: boolean,
    mes: number,
    anio: number,
  ): Obligacion {
    if (
      perfil.deberesFormalesRegistrados.has('ATS') ||
      perfil.deberesFormalesRegistrados.has('ANEXO TRANSACCIONAL SIMPLIFICADO')
    ) {
      return {
        id: 'general_ats',
        nombre: 'Anexo Transaccional Simplificado (ATS)',
        tipo: 'ATS',
        formulario: 'ATS',
        periodicidad: 'MENSUAL',
        estado: 'OBLIGATORIO',
        motivo: 'El RUC tiene registrado el deber formal del ATS.',
        baseLegal: 'Deberes formales del RUC (SRI en Línea).',
        fechaVencimiento: vencimientoAts({ novenoDigito: ruc9, mesPeriodo: mes, anioPeriodo: anio, periodicidad: 'MENSUAL' }),
      };
    }

    const sinDatos =
      perfil.obligadoLlevarContabilidad === undefined &&
      perfil.esContribuyenteEspecial === undefined &&
      perfil.designadoAgenteRetencionPorSri === undefined &&
      perfil.realizaOperacionesExterior === undefined;
    if (sinDatos) {
      return {
        id: 'general_ats',
        nombre: 'Anexo Transaccional Simplificado (ATS)',
        tipo: 'ATS',
        formulario: 'ATS',
        periodicidad: 'SEGUN_CORRESPONDA',
        estado: 'PENDIENTE_INFORMACION',
        motivo:
          'Información insuficiente: falta confirmar si lleva contabilidad, es agente de retención, contribuyente especial, o realiza comercio exterior.',
        baseLegal: 'Resolución NAC-DGERCGC — Presentación del ATS.',
        fechaVencimiento: null,
      };
    }

    const obligado =
      (perfil.obligadoLlevarContabilidad ?? false) ||
      (perfil.esContribuyenteEspecial ?? false) ||
      (perfil.designadoAgenteRetencionPorSri ?? false) ||
      (perfil.realizaOperacionesExterior ?? false);

    if (!obligado) {
      return {
        id: 'general_ats',
        nombre: 'Anexo Transaccional Simplificado (ATS)',
        tipo: 'ATS',
        formulario: 'ATS',
        periodicidad: 'NO_APLICA',
        estado: 'NO_OBLIGADO',
        motivo: 'No obligado: ese perfil no está dentro de los sujetos obligados al ATS.',
        baseLegal: 'Resolución NAC-DGERCGC — Presentación del ATS.',
        fechaVencimiento: null,
      };
    }

    return {
      id: 'general_ats',
      nombre: 'Anexo Transaccional Simplificado (ATS)',
      tipo: 'ATS',
      formulario: 'ATS',
      periodicidad: 'MENSUAL',
      estado: 'OBLIGATORIO',
      motivo: 'Se encuentra dentro de los sujetos obligados al ATS.',
      baseLegal: 'Resolución NAC-DGERCGC — Presentación del ATS.',
      fechaVencimiento: vencimientoAts({ novenoDigito: ruc9, mesPeriodo: mes, anioPeriodo: anio, periodicidad: 'MENSUAL' }),
    };
  }

  private static renta(perfil: PerfilTributario, ruc9: number | null, anioFiscal: number): Obligacion {
    const obligatorio = perfil.tipoPersona === 'SOCIEDAD' || perfil.superaFraccionBasicaRenta === true
      || perfil.deberesFormalesRegistrados.has('IMPUESTO A LA RENTA');
    return {
      id: 'general_renta',
      nombre: 'Impuesto a la Renta',
      tipo: 'RENTA',
      formulario: perfil.tipoPersona === 'SOCIEDAD' ? '101' : '102 / Impuesto a la Renta Personas Naturales',
      periodicidad: 'ANUAL',
      estado: obligatorio ? 'OBLIGATORIO' : 'PENDIENTE_INFORMACION',
      motivo: obligatorio
        ? 'Renta anual: sociedades en abril y personas naturales en marzo del año siguiente, según las condiciones del contribuyente.'
        : 'Falta confirmar el tipo de contribuyente, sus ingresos y las condiciones de obligación de declarar renta.',
      baseLegal: 'LORTI, Art. 40 y siguientes.',
      fechaVencimiento: obligatorio && perfil.tipoPersona
        ? vencimientoRentaAnual({ novenoDigito: ruc9, anioFiscal, mesVencimiento: perfil.tipoPersona === 'SOCIEDAD' ? 4 : 3, esContribuyenteEspecial: perfil.esContribuyenteEspecial })
        : null,
    };
  }
}
