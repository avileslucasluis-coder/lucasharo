import '../models/tax_declaration.dart';
import 'api_client.dart';

class DeclarationApiService {
  final ApiClient api;
  DeclarationApiService(this.api);

  Future<List<Map<String, dynamic>>> historial({required String companyId, required int mes, required int anio, String periodicidad = 'MENSUAL'}) async {
    final data = await api.get('/api/declarations/history', query: {
      'companyId': companyId, 'mes': '$mes', 'anio': '$anio', 'periodicidad': periodicidad,
    }) as List;
    return data.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<TaxDeclarationResult> generar({required String companyId, required int mes, required int anio, String periodicidad = 'MENSUAL', Map<String, String>? ajustes}) async {
    final data = await api.post('/api/declarations/generar', body: {
      if (ajustes != null) 'ajustes': ajustes,
      'companyId': companyId,
      'periodicidad': periodicidad,
      'mes': mes,
      'anio': anio,
    });
    return TaxDeclarationResult.fromJson(data);
  }

  Future<void> presentar({required String companyId, required int mes, required int anio, String periodicidad = 'MENSUAL'}) async {
    await api.post('/api/declarations/presentar', body: {
      'periodicidad': periodicidad,
      'companyId': companyId,
      'mes': mes,
      'anio': anio,
    });
  }
}
