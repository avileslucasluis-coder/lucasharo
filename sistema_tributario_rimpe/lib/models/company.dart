/// Espeja el modelo `Company` del backend. Reemplaza al antiguo
/// `Contribuyente` local: ahora la empresa vive en el servidor y este
/// objeto es solo la representación que llega por la API.
class Company {
  final Map<String, dynamic> perfilTributario;
  final String id;
  final String ruc;
  final String razonSocial;
  final String? nombreComercial;
  final String regimen; // GENERAL | RIMPE_EMPRENDEDOR | RIMPE_NEGOCIO_POPULAR
  final String? actividadEconomica;
  final bool? obligadoLlevarContabilidad;
  final bool? esContribuyenteEspecial;
  final bool? esAgenteRetencion;
  final String? miRol;

  Company({
    this.perfilTributario = const {},
    required this.id,
    required this.ruc,
    required this.razonSocial,
    this.nombreComercial,
    required this.regimen,
    this.actividadEconomica,
    this.obligadoLlevarContabilidad,
    this.esContribuyenteEspecial,
    this.esAgenteRetencion,
    this.miRol,
  });

  String get regimenLabel {
    switch (regimen) {
      case 'GENERAL':
        return 'Régimen General';
      case 'RIMPE_EMPRENDEDOR':
        return 'RIMPE — Emprendedor';
      case 'RIMPE_NEGOCIO_POPULAR':
        return 'RIMPE — Negocio Popular';
      default:
        return regimen;
    }
  }

  factory Company.fromJson(Map<String, dynamic> json) => Company(
        perfilTributario: Map<String, dynamic>.from(json),
        id: json['id'],
        ruc: json['ruc'],
        razonSocial: json['razonSocial'],
        nombreComercial: json['nombreComercial'],
        regimen: json['regimen'],
        actividadEconomica: json['actividadEconomica'],
        obligadoLlevarContabilidad: json['obligadoLlevarContabilidad'],
        esContribuyenteEspecial: json['esContribuyenteEspecial'],
        esAgenteRetencion: json['esAgenteRetencion'],
        miRol: json['miRol'],
      );
}
