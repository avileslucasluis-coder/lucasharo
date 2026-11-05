/// Espeja la respuesta de GET /api/tax/obligations — el resultado del
/// motor de reglas tributarias que corre en el backend.
class ObligacionApi {
  final String tipo; // IVA | RETENCIONES | ATS | RENTA
  final String? formulario;
  final String periodicidad;
  final String estado; // OBLIGATORIO | PENDIENTE_INFORMACION | NO_OBLIGADO | VENCIDO
  final String motivo;
  final String baseLegal;
  final DateTime? fechaVencimiento;

  ObligacionApi({
    required this.tipo,
    this.formulario,
    required this.periodicidad,
    required this.estado,
    required this.motivo,
    required this.baseLegal,
    this.fechaVencimiento,
  });

  String get nombre {
    switch (tipo) {
      case 'IVA':
        return 'Impuesto al Valor Agregado (IVA)';
      case 'RETENCIONES':
        return 'Retenciones en la Fuente';
      case 'ATS':
        return 'Anexo Transaccional Simplificado (ATS)';
      case 'RENTA':
        return 'Impuesto a la Renta';
      default:
        return tipo;
    }
  }

  String get icono {
    switch (estado) {
      case 'OBLIGATORIO':
        return '🟢';
      case 'PENDIENTE_INFORMACION':
        return '🟡';
      case 'NO_OBLIGADO':
        return '⚪';
      case 'VENCIDO':
        return '🔴';
      default:
        return '⚪';
    }
  }

  factory ObligacionApi.fromJson(Map<String, dynamic> json) => ObligacionApi(
        tipo: json['tipo'],
        formulario: json['formulario'],
        periodicidad: json['periodicidad'],
        estado: json['estado'],
        motivo: json['motivo'],
        baseLegal: json['baseLegal'],
        fechaVencimiento: json['fechaVencimiento'] != null ? DateTime.tryParse(json['fechaVencimiento']) : null,
      );
}
