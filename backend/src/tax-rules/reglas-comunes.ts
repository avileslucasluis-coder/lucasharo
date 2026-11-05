/// Calendario ordinario. Se ajustan fines de semana; feriados locales,
/// nacionales y ampliaciones excepcionales requieren el calendario SRI.
const DIA_POR_NOVENO_DIGITO: Record<number, number> = {
  1: 10,
  2: 12,
  3: 14,
  4: 16,
  5: 18,
  6: 20,
  7: 22,
  8: 24,
  9: 26,
  0: 28,
};

export function novenoDigito(ruc: string): number | null {
  if (!/^\d{13}$/.test(ruc)) return null;
  return Number(ruc[8]);
}

export function vencimientoMensual(params: {
  novenoDigito: number | null;
  mesPeriodo: number;
  anioPeriodo: number;
  esContribuyenteEspecial?: boolean;
}): Date | null {
  const { mesPeriodo, anioPeriodo, esContribuyenteEspecial } = params;
  if (params.novenoDigito === null && !esContribuyenteEspecial) return null;

  const mesSiguiente = mesPeriodo === 12 ? 1 : mesPeriodo + 1;
  const anioSiguiente = mesPeriodo === 12 ? anioPeriodo + 1 : anioPeriodo;
  // Reglamento LRTI, art. 254: día 11 para contribuyentes especiales.
  const dia = esContribuyenteEspecial ? 11 : DIA_POR_NOVENO_DIGITO[params.novenoDigito as number];
  if (!dia) return null;

  let fecha = new Date(anioSiguiente, mesSiguiente - 1, dia);
  const diaSemana = fecha.getDay(); // 0 = domingo, 6 = sábado
  if (diaSemana === 6) {
    const candidata = new Date(fecha);
    candidata.setDate(candidata.getDate() + 2);
    if (candidata.getMonth() === fecha.getMonth()) fecha = candidata;
    else fecha.setDate(fecha.getDate() - 1);
  } else if (diaSemana === 0) {
    const candidata = new Date(fecha);
    candidata.setDate(candidata.getDate() + 1);
    if (candidata.getMonth() === fecha.getMonth()) fecha = candidata;
    else fecha.setDate(fecha.getDate() - 2);
  }
  return fecha;
}

export function vencimientoSemestral(params: {
  novenoDigito: number | null;
  mesPeriodo: number;
  anioPeriodo: number;
}): Date | null {
  const primerSemestre = params.mesPeriodo <= 6;
  const mesDeclaracion = primerSemestre ? 7 : 1;
  const anioDeclaracion = primerSemestre ? params.anioPeriodo : params.anioPeriodo + 1;
  const mesPeriodoBase = mesDeclaracion - 1 === 0 ? 12 : mesDeclaracion - 1;
  const anioPeriodoBase = mesDeclaracion - 1 === 0 ? anioDeclaracion - 1 : anioDeclaracion;
  return vencimientoMensual({
    novenoDigito: params.novenoDigito,
    mesPeriodo: mesPeriodoBase,
    anioPeriodo: anioPeriodoBase,
  });
}

export function vencimientoRentaAnual(params: {
  novenoDigito: number | null;
  anioFiscal: number;
  mesVencimiento: 3 | 4 | 5;
  esContribuyenteEspecial?: boolean;
}): Date | null {
  return vencimientoMensual({
    novenoDigito: params.novenoDigito,
    mesPeriodo: params.mesVencimiento - 1,
    anioPeriodo: params.anioFiscal + 1,
    esContribuyenteEspecial: params.esContribuyenteEspecial,
  });
}

/** ATS vence en el mes subsiguiente; el calendario de impuestos no aplica. */
export function vencimientoAts(params: {
  novenoDigito: number | null;
  mesPeriodo: number;
  anioPeriodo: number;
  periodicidad: 'MENSUAL' | 'SEMESTRAL';
}): Date | null {
  const mesCierre = params.periodicidad === 'SEMESTRAL'
    ? (params.mesPeriodo <= 6 ? 6 : 12)
    : params.mesPeriodo;
  const siguiente = new Date(params.anioPeriodo, mesCierre, 1);
  return vencimientoMensual({
    novenoDigito: params.novenoDigito,
    mesPeriodo: siguiente.getMonth() + 1,
    anioPeriodo: siguiente.getFullYear(),
  });
}
