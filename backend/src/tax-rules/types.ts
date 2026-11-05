export type Periodicidad = 'MENSUAL' | 'SEMESTRAL' | 'ANUAL' | 'SEGUN_CORRESPONDA' | 'NO_APLICA';

export type EstadoObligacion =
  | 'OBLIGATORIO'
  | 'PENDIENTE_INFORMACION'
  | 'NO_OBLIGADO'
  | 'VENCIDO';

export interface Obligacion {
  id: string;
  nombre: string;
  tipo: 'IVA' | 'RETENCIONES' | 'ATS' | 'RENTA';
  formulario: string | null;
  periodicidad: Periodicidad;
  estado: EstadoObligacion;
  motivo: string;
  baseLegal: string;
  fechaVencimiento: Date | null;
}

/// Datos del contribuyente que alimentan el motor de reglas. Un campo en
/// `null`/`undefined` significa "no se sabe" — el motor responde
/// PENDIENTE_INFORMACION en vez de asumir un valor por defecto.
export interface PerfilTributario {
  regimen: 'GENERAL' | 'RIMPE_EMPRENDEDOR' | 'RIMPE_NEGOCIO_POPULAR';
  realizaVentasGravadasIva?: boolean;
  realizaVentasTarifa0?: boolean;
  obligadoLlevarContabilidad?: boolean;
  esContribuyenteEspecial?: boolean;
  designadoAgenteRetencionPorSri?: boolean;
  realizaOperacionesExterior?: boolean;
  tipoPersona?: 'NATURAL' | 'SOCIEDAD';
  superaFraccionBasicaRenta?: boolean;
  periodicidadIvaDeclarada?: 'MENSUAL' | 'SEMESTRAL';
  realizaActividadesExcluidasRimpe?: boolean;
  /// Deberes formales tal como aparecen en el RUC, si el contador los
  /// transcribió manualmente. Esta fuente manda sobre las reglas por
  /// defecto del régimen cuando está presente.
  deberesFormalesRegistrados: Set<string>;
}
