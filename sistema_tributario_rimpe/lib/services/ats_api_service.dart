import 'api_client.dart';

class AtsErrorItem {
  final String campo;
  final String mensaje;
  AtsErrorItem(this.campo, this.mensaje);
  factory AtsErrorItem.fromJson(Map<String, dynamic> json) => AtsErrorItem(json['campo'], json['mensaje']);
}

class AtsValidacion {
  final List<AtsErrorItem> errores;
  final List<AtsErrorItem> advertencias;
  AtsValidacion(this.errores, this.advertencias);

  factory AtsValidacion.fromJson(Map<String, dynamic> json) => AtsValidacion(
        (json['errores'] as List).map((e) => AtsErrorItem.fromJson(e)).toList(),
        (json['advertencias'] as List).map((e) => AtsErrorItem.fromJson(e)).toList(),
      );
}

class AtsApiService {
  final ApiClient api;
  AtsApiService(this.api);

  Future<AtsValidacion> validar({required String companyId, required int mes, required int anio}) async {
    final data = await api.post('/api/ats/validate', body: {'companyId': companyId, 'mes': mes, 'anio': anio});
    return AtsValidacion.fromJson(data);
  }

  /// Devuelve un borrador XML. Las advertencias de validar() deben mostrarse
  /// antes de descargarlo; no implica presentación ni aceptación del SRI.
  Future<String> generar({required String companyId, required int mes, required int anio}) async {
    final data = await api.post('/api/ats/generate', body: {'companyId': companyId, 'mes': mes, 'anio': anio});
    return data['xml'] as String;
  }

  Future<List<Map<String, dynamic>>> historial(String companyId) async {
    final data = await api.get('/api/ats/history', query: {'companyId': companyId}) as List;
    return data.cast<Map<String, dynamic>>();
  }
}
