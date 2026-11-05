const labels: Record<string, string> = {
  totalVentasGravadas: 'Ventas gravadas', totalVentas0: 'Ventas tarifa cero', totalIvaVentas: 'IVA en ventas',
  totalComprasGravadas: 'Compras gravadas', totalCompras0: 'Compras tarifa cero', totalIvaCompras: 'IVA en compras',
  totalIvaRetenidoEnVentas: 'IVA retenido por clientes', totalRetencionesIvaAplicadas: 'IVA retenido a proveedores',
  totalRetencionesRentaAplicadas: 'Renta retenida a proveedores',
  creditoAnteriorCompras: 'Crédito anterior por adquisiciones', creditoAnteriorRetenciones: 'Crédito anterior por retenciones',
  creditoSiguienteCompras: 'Crédito siguiente por adquisiciones', creditoSiguienteRetenciones: 'Crédito siguiente por retenciones',
  creditoTributarioSiguientePeriodo: 'Crédito total para el siguiente período',
  ivaComprasConDerechoCredito: 'IVA de compras con derecho a crédito', ivaAPagar104: 'IVA propio estimado',
  totalAPagar104: 'Total estimado formulario 104', totalAPagar103: 'Total estimado formulario 103',
  factorCredito: 'Factor de crédito', ivaSinDerechoCredito: 'IVA sin derecho a crédito',
  ajusteCreditoCompras: 'IVA devuelto o rechazado por adquisiciones', ajusteCreditoRetenciones: 'IVA devuelto o rechazado por retenciones',
  justificacion: 'Justificación de la conciliación', conciliado: 'Conciliación registrada',
};

function cell(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(2).replace('.', ',');
  let text = String(value ?? '');
  // El archivo también contiene texto introducido por usuarios. Evitar fórmulas al abrirlo en Excel.
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function declarationReport(snapshot: Record<string, any>, version: number, createdAt: Date): string {
  const rows: unknown[][] = [
    ['Sistema Tributario', 'Papel de trabajo'],
    ['Alcance', 'No acredita presentación ni aceptación del SRI. Valores de la versión guardada; no recalculados con comprobantes actuales.'],
    ['Empresa (identificador)', snapshot.companyId], ['Declaración', snapshot.id],
    ['Período', `${snapshot.mes}/${snapshot.anio}`], ['Periodicidad', snapshot.periodicidad],
    ['Versión', String(version)], ['Fecha de la versión (UTC)', createdAt.toISOString()], ['Estado local', snapshot.estado],
    ['Sección', 'Concepto', 'Valor'],
  ];
  for (const [key, value] of Object.entries(snapshot)) {
    if (key.startsWith('total')) rows.push(['Comprobantes importados', labels[key] ?? key, Number(value)]);
  }
  for (const [section, values] of [['Conciliación', snapshot.ajustes], ['Liquidación', snapshot.liquidacion]] as const) {
    if (values && typeof values === 'object' && !Array.isArray(values)) {
      for (const [key, value] of Object.entries(values)) {
        if (value !== null && typeof value === 'object') continue;
        rows.push([section, labels[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2'), typeof value === 'boolean' ? (value ? 'Sí' : 'No') : typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value]);
      }
    }
  }
  const tariffs = snapshot.liquidacion?.desgloseTarifas;
  if (Array.isArray(tariffs)) {
    rows.push([], ['Totales por tarifa'], ['Operación', 'Impuesto', 'Tarifa', 'Subtotal / base', 'IVA / retenido']);
    for (const item of tariffs) rows.push([item.direccion, item.grupo, item.tarifa, item.base, item.valor]);
  }
  const detail = snapshot.liquidacion?.detalleComprobantes;
  if (Array.isArray(detail)) {
    rows.push([], ['Detalle de comprobantes de esta versión'],
      ['Clave de acceso', 'Fecha', 'Tipo', 'Dirección', 'Emisor', 'Nombre', 'Signo', 'Base gravada', 'Base cero', 'IVA', 'Renta retenida']);
    for (const item of detail) rows.push([item.clave, item.fecha, item.tipo, item.direccion, item.emisor, item.nombre, String(item.signo), Number(item.baseGravada), Number(item.baseCero), Number(item.iva), Number(item.renta)]);
    rows.push(['Interpretación', 'Las notas de crédito tienen signo -1. Los importes originales se conservan. El derecho a crédito se concilia por separado; las operaciones especiales del ATS no se suman automáticamente al IVA.']);
  } else rows.push(['Detalle', 'Esta versión antigua no conserva el detalle de comprobantes.']);
  const control = snapshot.liquidacion?.controlPeriodo;
  if (control) rows.push(['Control del período', control.accion, control.motivo, control.fecha]);
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
}
