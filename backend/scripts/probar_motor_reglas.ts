import { RegimenGeneralRules } from '../src/tax-rules/regimenes/regimen-general.rules';
import { RimpeEmprendedorRules } from '../src/tax-rules/regimenes/rimpe-emprendedor.rules';
import { RimpeNegocioPopularRules } from '../src/tax-rules/regimenes/rimpe-negocio-popular.rules';
import { PerfilTributario } from '../src/tax-rules/types';

function linea(titulo: string) {
  console.log('\n=== ' + titulo + ' ===');
}

// Caso 1: RIMPE Emprendedor con ventas gravadas, sin más datos.
linea('RIMPE Emprendedor — con ventas gravadas con IVA');
const perfil1: PerfilTributario = {
  regimen: 'RIMPE_EMPRENDEDOR',
  realizaVentasGravadasIva: true,
  deberesFormalesRegistrados: new Set(),
};
for (const o of RimpeEmprendedorRules.evaluar(perfil1, 5, 8, 2026)) {
  console.log(`${o.tipo} -> ${o.estado} (${o.formulario ?? 'sin formulario'} / ${o.periodicidad}) — ${o.motivo}`);
}

// Caso 2: RIMPE Negocio Popular sin ningún dato adicional (caso típico).
linea('RIMPE Negocio Popular — sin datos adicionales');
const perfil2: PerfilTributario = {
  regimen: 'RIMPE_NEGOCIO_POPULAR',
  deberesFormalesRegistrados: new Set(),
};
for (const o of RimpeNegocioPopularRules.evaluar(perfil2, 3, 8, 2026)) {
  console.log(`${o.tipo} -> ${o.estado} (${o.formulario ?? 'sin formulario'} / ${o.periodicidad}) — ${o.motivo}`);
}

// Caso 3: Régimen General, agente de retención y con ventas gravadas.
linea('Régimen General — agente de retención + ventas gravadas');
const perfil3: PerfilTributario = {
  regimen: 'GENERAL',
  realizaVentasGravadasIva: true,
  obligadoLlevarContabilidad: true,
  designadoAgenteRetencionPorSri: false,
  esContribuyenteEspecial: false,
  realizaOperacionesExterior: false,
  deberesFormalesRegistrados: new Set(),
};
for (const o of RegimenGeneralRules.evaluar(perfil3, 5, 8, 2026)) {
  console.log(
    `${o.tipo} -> ${o.estado} (${o.formulario ?? 'sin formulario'} / ${o.periodicidad}) — vence ${o.fechaVencimiento?.toISOString().slice(0, 10) ?? '—'}`,
  );
}

// Caso 4: sin ningún dato del contribuyente — debe pedir información, nunca inventar.
linea('Régimen General — sin ningún dato (debe pedir información)');
const perfil4: PerfilTributario = {
  regimen: 'GENERAL',
  deberesFormalesRegistrados: new Set(),
};
for (const o of RegimenGeneralRules.evaluar(perfil4, 5, 8, 2026)) {
  console.log(`${o.tipo} -> ${o.estado} — ${o.motivo}`);
}
