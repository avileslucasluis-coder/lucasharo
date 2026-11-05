import { Obligacion, PerfilTributario } from '../types';
import { vencimientoMensual, vencimientoSemestral, vencimientoRentaAnual, vencimientoAts } from '../reglas-comunes';

/// RIMPE Emprendedor NO es agente de retención ni está obligado al ATS
/// por el solo hecho de estar en este régimen — solo en casos puntuales
/// (designación expresa del SRI, operaciones al exterior). Nunca se usa
/// la regla "RIMPE Emprendedor = Formulario X".
/// IVA semestral por regla general; la opción mensual requiere constancia.
export class RimpeEmprendedorRules {
  static evaluar(perfil: PerfilTributario, ruc9: number | null, mes: number, anio: number): Obligacion[] {
    return [
      this.iva(perfil, ruc9, mes, anio),
      this.retenciones(perfil, ruc9, mes, anio),
      this.ats(perfil, ruc9, mes, anio),
      this.renta(perfil, ruc9, anio),
    ];
  }

  private static iva(perfil: PerfilTributario, ruc9: number | null, mes: number, anio: number): Obligacion {
    const mensual = perfil.periodicidadIvaDeclarada === 'MENSUAL';
    return {
      id: 'rimpe_emp_iva',
      nombre: 'Impuesto al Valor Agregado (IVA)',
      tipo: 'IVA',
      formulario: '104',
      periodicidad: mensual ? 'MENSUAL' : 'SEMESTRAL',
      estado: 'OBLIGATORIO',
      motivo: mensual
        ? 'Se ha indicado la presentación mensual de IVA para este contribuyente.'
        : 'El RIMPE Emprendedor declara IVA semestral acumulado; la ausencia de ventas gravadas no elimina este deber.',
      baseLegal: 'Reglamento LRTI, art. 236; SRI, Régimen RIMPE — Impuesto al Valor Agregado.',
      fechaVencimiento: mensual
        ? vencimientoMensual({ novenoDigito: ruc9, mesPeriodo: mes, anioPeriodo: anio })
        : vencimientoSemestral({ novenoDigito: ruc9, mesPeriodo: mes, anioPeriodo: anio }),
    };
  }

  private static retenciones(perfil: PerfilTributario, ruc9: number | null, mes: number, anio: number): Obligacion {
    if (perfil.deberesFormalesRegistrados.has('RETENCIONES EN LA FUENTE')) {
      return {
        id: 'rimpe_emp_retenciones',
        nombre: 'Retenciones en la Fuente',
        tipo: 'RETENCIONES',
        formulario: '103',
        periodicidad: 'MENSUAL',
        estado: 'OBLIGATORIO',
        motivo: 'El RUC tiene registrado el deber formal de Retenciones en la Fuente.',
        baseLegal: 'Deberes formales del RUC (SRI en Línea).',
        fechaVencimiento: vencimientoMensual({ novenoDigito: ruc9, mesPeriodo: mes, anioPeriodo: anio }),
      };
    }

    if (perfil.designadoAgenteRetencionPorSri === undefined && perfil.realizaOperacionesExterior === undefined) {
      return {
        id: 'rimpe_emp_retenciones',
        nombre: 'Retenciones en la Fuente',
        tipo: 'RETENCIONES',
        formulario: '103',
        periodicidad: 'SEGUN_CORRESPONDA',
        estado: 'PENDIENTE_INFORMACION',
        motivo:
          'Información insuficiente: un RIMPE Emprendedor solo retiene en casos puntuales (pagos al exterior, designación expresa del SRI).',
        baseLegal: 'LORTI, Art. 45 y 50; régimen RIMPE.',
        fechaVencimiento: null,
      };
    }

    const esAgente = (perfil.designadoAgenteRetencionPorSri ?? false) || (perfil.realizaOperacionesExterior ?? false);
    if (!esAgente) {
      return {
        id: 'rimpe_emp_retenciones',
        nombre: 'Retenciones en la Fuente',
        tipo: 'RETENCIONES',
        formulario: '103',
        periodicidad: 'NO_APLICA',
        estado: 'NO_OBLIGADO',
        motivo: 'No corresponde: por defecto un RIMPE Emprendedor no actúa como agente de retención.',
        baseLegal: 'LORTI, Art. 45 y 50; régimen RIMPE.',
        fechaVencimiento: null,
      };
    }

    return {
      id: 'rimpe_emp_retenciones',
      nombre: 'Retenciones en la Fuente',
      tipo: 'RETENCIONES',
      formulario: '103',
      periodicidad: 'MENSUAL',
      estado: 'OBLIGATORIO',
      motivo: 'Corresponde porque fue designado agente de retención o realiza pagos al exterior.',
      baseLegal: 'LORTI, Art. 45 y 50; régimen RIMPE.',
      fechaVencimiento: vencimientoMensual({ novenoDigito: ruc9, mesPeriodo: mes, anioPeriodo: anio }),
    };
  }

  private static ats(perfil: PerfilTributario, ruc9: number | null, mes: number, anio: number): Obligacion {
    if (
      perfil.deberesFormalesRegistrados.has('ATS') ||
      perfil.deberesFormalesRegistrados.has('ANEXO TRANSACCIONAL SIMPLIFICADO')
    ) {
      return {
        id: 'rimpe_emp_ats',
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

    if (perfil.designadoAgenteRetencionPorSri === undefined && perfil.realizaOperacionesExterior === undefined) {
      return {
        id: 'rimpe_emp_ats',
        nombre: 'Anexo Transaccional Simplificado (ATS)',
        tipo: 'ATS',
        formulario: 'ATS',
        periodicidad: 'SEGUN_CORRESPONDA',
        estado: 'PENDIENTE_INFORMACION',
        motivo:
          'Por defecto un RIMPE Emprendedor no está obligado al ATS, salvo ser agente de retención o realizar comercio exterior — falta confirmar.',
        baseLegal: 'Resolución NAC-DGERCGC — Presentación del ATS.',
        fechaVencimiento: null,
      };
    }

    const obligado = (perfil.designadoAgenteRetencionPorSri ?? false) || (perfil.realizaOperacionesExterior ?? false);
    if (!obligado) {
      return {
        id: 'rimpe_emp_ats',
        nombre: 'Anexo Transaccional Simplificado (ATS)',
        tipo: 'ATS',
        formulario: 'ATS',
        periodicidad: 'NO_APLICA',
        estado: 'NO_OBLIGADO',
        motivo: 'No obligado: sin retenciones a cargo ni operaciones de comercio exterior.',
        baseLegal: 'Resolución NAC-DGERCGC — Presentación del ATS.',
        fechaVencimiento: null,
      };
    }

    return {
      id: 'rimpe_emp_ats',
      nombre: 'Anexo Transaccional Simplificado (ATS)',
      tipo: 'ATS',
      formulario: 'ATS',
      periodicidad: 'SEMESTRAL',
      estado: 'OBLIGATORIO',
      motivo: 'Es agente de retención o realiza operaciones de comercio exterior.',
      baseLegal: 'Resolución NAC-DGERCGC — Presentación del ATS.',
      fechaVencimiento: vencimientoAts({ novenoDigito: ruc9, mesPeriodo: mes, anioPeriodo: anio, periodicidad: 'SEMESTRAL' }),
    };
  }

  private static renta(perfil: PerfilTributario, ruc9: number | null, anioFiscal: number): Obligacion {
    return {
      id: 'rimpe_emp_renta',
      nombre: 'Impuesto a la Renta (régimen RIMPE)',
      tipo: 'RENTA',
      formulario: perfil.tipoPersona === 'SOCIEDAD' ? 'Impuesto a la Renta Sociedades' : 'Impuesto a la Renta Personas Naturales / Sociedades',
      periodicidad: 'ANUAL',
      estado: 'OBLIGATORIO',
      motivo: 'Declaración anual RIMPE: personas naturales en mayo y sociedades en abril del año siguiente. Se requiere el tipo de contribuyente para calcular el vencimiento.',
      baseLegal: 'Régimen RIMPE — LORTI (reformada), tabla de tarifas RIMPE.',
      fechaVencimiento: perfil.tipoPersona
        ? vencimientoRentaAnual({ novenoDigito: ruc9, anioFiscal, mesVencimiento: perfil.tipoPersona === 'NATURAL' ? 5 : 4 })
        : null,
    };
  }
}
