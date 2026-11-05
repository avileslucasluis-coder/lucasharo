import { createHash } from 'crypto';

export function declarationSource(vouchers: any[]) {
  const detail = vouchers.map(v => ({ id: v.id ?? '', clave: v.claveAcceso ?? '',
    fecha: v.fechaEmision?.toISOString().slice(0, 10) ?? '', tipo: v.tipoComprobante, direccion: v.direccion,
    emisor: v.rucEmisor ?? '', nombre: v.razonSocialEmisor ?? '',
    baseGravada: String(v.baseImponibleIva), baseCero: String(v.baseImponibleIva0),
    iva: String(v.montoIva), renta: String(v.montoRentaRetenida ?? 0),
    signo: v.tipoComprobante === 'NOTA_CREDITO' ? -1 : 1,
  })).sort((a, b) => a.id.localeCompare(b.id));
  return { detalleComprobantes: detail, huellaComprobantes: createHash('sha256').update(JSON.stringify(detail)).digest('hex') };
}
