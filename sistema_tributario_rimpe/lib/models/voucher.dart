/// Espeja `Voucher` del backend (reemplaza al antiguo `ComprobanteXml`
/// local: el parseo del XML ahora lo hace el servidor).
class Voucher {
  final List<Map<String, dynamic>> detalleImpuestos;
  final bool clasificacionPendiente;
  final String fuente;
  final String id;
  final String tipoComprobante;
  final String direccion; // VENTA | COMPRA | RETENCION_RECIBIDA | RETENCION_EMITIDA | NO_RELACIONADO
  final String claveAcceso;
  final String rucEmisor;
  final String razonSocialEmisor;
  final String? identificacionContraparte;
  final String? razonSocialContraparte;
  final DateTime fechaEmision;
  final double baseImponibleIva;
  final double baseImponibleIva0;
  final double montoIva;
  final double montoRentaRetenida;
  final double importeTotal;
  final Withholding? withholding;

  Voucher({
    this.detalleImpuestos = const [], this.clasificacionPendiente = false, this.fuente = 'XML',
    required this.id,
    required this.tipoComprobante,
    required this.direccion,
    required this.claveAcceso,
    required this.rucEmisor,
    required this.razonSocialEmisor,
    this.identificacionContraparte,
    this.razonSocialContraparte,
    required this.fechaEmision,
    required this.baseImponibleIva,
    required this.baseImponibleIva0,
    required this.montoIva,
    required this.montoRentaRetenida,
    required this.importeTotal,
    this.withholding,
  });

  String get direccionLabel {
    switch (direccion) {
      case 'VENTA':
        return 'Venta propia';
      case 'COMPRA':
        return 'Compra a proveedor';
      case 'RETENCION_RECIBIDA':
        return 'Retención que te aplicaron';
      case 'RETENCION_EMITIDA':
        return 'Retención que tú emitiste';
      default:
        return 'Sin relación con el RUC — revisar';
    }
  }

  factory Voucher.fromJson(Map<String, dynamic> json) => Voucher(
        detalleImpuestos: (json['detalleImpuestos'] as List? ?? []).map((e) => Map<String, dynamic>.from(e)).toList(),
        clasificacionPendiente: json['clasificacionPendiente'] == true, fuente: json['fuente'] ?? 'XML',
        id: json['id'],
        tipoComprobante: json['tipoComprobante'],
        direccion: json['direccion'],
        claveAcceso: json['claveAcceso'],
        rucEmisor: json['rucEmisor'],
        razonSocialEmisor: json['razonSocialEmisor'],
        identificacionContraparte: json['identificacionContraparte'],
        razonSocialContraparte: json['razonSocialContraparte'],
        fechaEmision: DateTime.parse(json['fechaEmision']),
        baseImponibleIva: double.parse(json['baseImponibleIva'].toString()),
        baseImponibleIva0: double.parse(json['baseImponibleIva0'].toString()),
        montoIva: double.parse(json['montoIva'].toString()),
        montoRentaRetenida: double.parse((json['montoRentaRetenida'] ?? 0).toString()),
        importeTotal: double.parse(json['importeTotal'].toString()),
        withholding: json['withholding'] != null ? Withholding.fromJson(json['withholding']) : null,
      );
}

class Withholding {
  final String codigoRetencionIva;
  final double porcentajeIva;
  final double valorRetenidoIva;
  final String codigoRetencionRenta;
  final double porcentajeRenta;
  final double valorRetenidoRenta;

  Withholding({
    required this.codigoRetencionIva,
    required this.porcentajeIva,
    required this.valorRetenidoIva,
    required this.codigoRetencionRenta,
    required this.porcentajeRenta,
    required this.valorRetenidoRenta,
  });

  double get total => valorRetenidoIva + valorRetenidoRenta;

  factory Withholding.fromJson(Map<String, dynamic> json) => Withholding(
        codigoRetencionIva: json['codigoRetencionIva'],
        porcentajeIva: double.parse(json['porcentajeIva'].toString()),
        valorRetenidoIva: double.parse(json['valorRetenidoIva'].toString()),
        codigoRetencionRenta: json['codigoRetencionRenta'],
        porcentajeRenta: double.parse(json['porcentajeRenta'].toString()),
        valorRetenidoRenta: double.parse(json['valorRetenidoRenta'].toString()),
      );
}
