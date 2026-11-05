import '../models/obligacion.dart';
import 'api_client.dart';

class TaxObligationsService {
  final ApiClient api;
  TaxObligationsService(this.api);

  Future<List<ObligacionApi>> evaluar({required String companyId, required int mes, required int anio}) async {
    final data = await api.get('/api/tax/obligations', query: {
      'companyId': companyId,
      'mes': '$mes',
      'anio': '$anio',
    }) as List;
    return data.map((e) => ObligacionApi.fromJson(e)).toList();
  }
}
