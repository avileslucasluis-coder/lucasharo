/// Espeja la respuesta de POST /api/declarations/generar: los totales
/// guardados en `tax_declarations` más los campos calculados que el
/// backend agrega en la respuesta (ivaAPagar104, totalAPagar103, etc.).
class TaxDeclarationResult {
  final String id;
  final int revision;
  final Map<String, dynamic> liquidacion;
  final double? total104;
  final String periodicidad;
  final int mes;
  final int anio;
  final String estado;
  final double totalVentasGravadas;
  final double totalVentas0;
  final double totalIvaVentas;
  final double totalComprasGravadas;
  final double totalCompras0;
  final double totalIvaCompras;
  final double totalIvaRetenidoEnVentas;
  final double totalRetencionesIvaAplicadas;
  final double totalRetencionesRentaAplicadas;
  final double ivaAPagar104;
  final double creditoTributarioSiguientePeriodo;
  final double totalAPagar103;
  final double rentaRetenidaEnVentasInformativo;
  final List<String> advertencias;
  double get totalAPagar104 => total104 ?? ivaAPagar104 + totalRetencionesIvaAplicadas;

  TaxDeclarationResult({
    this.id = '', this.revision = 1, this.liquidacion = const {}, this.total104,
    this.periodicidad = 'MENSUAL',
    required this.mes,
    required this.anio,
    required this.estado,
    required this.totalVentasGravadas,
    required this.totalVentas0,
    required this.totalIvaVentas,
    required this.totalComprasGravadas,
    required this.totalCompras0,
    required this.totalIvaCompras,
    required this.totalIvaRetenidoEnVentas,
    required this.totalRetencionesIvaAplicadas,
    required this.totalRetencionesRentaAplicadas,
    required this.ivaAPagar104,
    required this.creditoTributarioSiguientePeriodo,
    required this.totalAPagar103,
    required this.rentaRetenidaEnVentasInformativo,
    this.advertencias = const [],
  });

  factory TaxDeclarationResult.fromJson(Map<String, dynamic> json) {
    double n(String k) => double.parse((json[k] ?? 0).toString());
    return TaxDeclarationResult(
      id: json['id'] ?? '', revision: json['revision'] ?? 1,
      liquidacion: Map<String, dynamic>.from(json['liquidacion'] ?? {}), total104: n('totalAPagar104'),
      periodicidad: json['periodicidad'] ?? 'MENSUAL',
      mes: json['mes'],
      anio: json['anio'],
      estado: json['estado'] ?? 'BORRADOR',
      totalVentasGravadas: n('totalVentasGravadas'),
      totalVentas0: n('totalVentas0'),
      totalIvaVentas: n('totalIvaVentas'),
      totalComprasGravadas: n('totalComprasGravadas'),
      totalCompras0: n('totalCompras0'),
      totalIvaCompras: n('totalIvaCompras'),
      totalIvaRetenidoEnVentas: n('totalIvaRetenidoEnVentas'),
      totalRetencionesIvaAplicadas: n('totalRetencionesIvaAplicadas'),
      totalRetencionesRentaAplicadas: n('totalRetencionesRentaAplicadas'),
      ivaAPagar104: n('ivaAPagar104'),
      creditoTributarioSiguientePeriodo: n('creditoTributarioSiguientePeriodo'),
      totalAPagar103: n('totalAPagar103'),
      rentaRetenidaEnVentasInformativo: n('rentaRetenidaEnVentasInformativo'),
      advertencias: (json['advertencias'] as List? ?? []).map((e) => e.toString()).toList(),
    );
  }
}
