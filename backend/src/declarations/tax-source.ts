import { createHash } from 'crypto';
import { AtsOperation, Company, Voucher } from '@prisma/client';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]),
  );
  return value;
}
export function sourceHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
const period = (date: Date) => date.toISOString().slice(0, 7);

/** Inventario de fuentes; no determina derecho a crédito ni modifica liquidaciones. */
export function taxSource(company: Company, vouchers: Voucher[], operations: AtsOperation[], selectedPeriod: string) {
  if (vouchers.some(v => v.companyId !== company.id) || operations.some(o => o.companyId !== company.id)) {
    throw new Error('Fuentes de otra empresa.');
  }
  const issues: { code: string; sourceId: string; relatedId?: string }[] = [];
  const documents = [...vouchers].sort((a, b) => a.id.localeCompare(b.id)).map(v => {
    const emissionPeriod = period(v.fechaEmision);
    const atsPeriod = period(v.direccion === 'COMPRA' ? v.fechaRegistroAts ?? v.fechaEmision : v.fechaEmision);
    if (emissionPeriod !== atsPeriod) issues.push({ code: 'PERIOD_DECISION_REQUIRED', sourceId: v.id });
    return { id: v.id, clave: v.claveAcceso, tipo: v.tipoComprobante, direccion: v.direccion,
      emisor: v.rucEmisor, contraparte: v.identificacionContraparte,
      fechaEmision: v.fechaEmision.toISOString(), fechaRegistroAts: v.fechaRegistroAts?.toISOString() ?? null,
      emissionPeriod, atsPeriod, inEmissionPeriod: emissionPeriod === selectedPeriod, inAtsPeriod: atsPeriod === selectedPeriod,
      baseGravada: v.baseImponibleIva.toString(), baseCero: v.baseImponibleIva0.toString(), iva: v.montoIva.toString(),
      renta: v.montoRentaRetenida.toString(), total: v.importeTotal.toString(),
      revisionAts: v.atsRevision, xmlHash: v.xmlOriginal ? sourceHash(v.xmlOriginal) : null };
  });
  const complementary = [...operations].sort((a, b) => a.id.localeCompare(b.id)).map(o => {
    const linked = vouchers.find(v => v.id === o.voucherId);
    const data = o.data as Record<string, unknown>;
    if (o.voucherId && !linked) issues.push({ code: 'LINK_NOT_FOUND', sourceId: o.id, relatedId: o.voucherId });
    if (linked && data.autorizacion !== linked.claveAcceso) issues.push({ code: 'LINK_AUTHORIZATION_MISMATCH', sourceId: o.id, relatedId: linked.id });
    if (!o.voucherId && typeof data.autorizacion === 'string') {
      for (const v of vouchers.filter(v => v.claveAcceso === data.autorizacion))
        issues.push({ code: 'POSSIBLE_DUPLICATE', sourceId: o.id, relatedId: v.id });
    }
    if (['IMPORTACION', 'EXPORTACION', 'COMPRA_ESPECIAL', 'REEMBOLSO'].includes(o.kind))
      issues.push({ code: 'TAX_TREATMENT_REQUIRED', sourceId: o.id });
    return { id: o.id, kind: o.kind, mes: o.mes, anio: o.anio, version: o.version, voucherId: o.voucherId,
      reference: o.reference, data: o.data, actorId: o.actorId,
      representation: o.voucherId ? 'LINKED_COMPLEMENT' : 'INDEPENDENT_REQUIRES_REVIEW' };
  });
  const profile = { id: company.id, ruc: company.ruc, regimen: company.regimen, tipoPersona: company.tipoPersona,
    periodicidadIvaDeclarada: company.periodicidadIvaDeclarada, esAgenteRetencion: company.esAgenteRetencion,
    obligadoLlevarContabilidad: company.obligadoLlevarContabilidad, esContribuyenteEspecial: company.esContribuyenteEspecial,
    realizaVentasGravadasIva: company.realizaVentasGravadasIva, realizaVentasTarifa0: company.realizaVentasTarifa0,
    realizaOperacionesExterior: company.realizaOperacionesExterior,
    realizaActividadesExcluidasRimpe: company.realizaActividadesExcluidasRimpe,
    deberesFormalesRegistrados: [...company.deberesFormalesRegistrados].sort() };
  const snapshot = { schemaVersion: 1, selectedPeriod, profile, documents, complementary };
  return { snapshot, fingerprint: sourceHash(snapshot), issues, scope: 'SOURCE_INVENTORY_ONLY', changesTaxCalculation: false };
}
