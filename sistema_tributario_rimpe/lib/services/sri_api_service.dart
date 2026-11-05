import 'api_client.dart';

class SriApiService {
  final ApiClient _api;
  SriApiService(this._api);

  Future<List<Map<String, dynamic>>> listar(String companyId) async =>
      ((await _api.get('/api/sri/documents', query: {'companyId': companyId})) as List)
          .map((e) => Map<String, dynamic>.from(e as Map)).toList();

  Future<Map<String, dynamic>> firmar(String companyId, String xml, String p12, String clave) async =>
      Map<String, dynamic>.from(await _api.post('/api/sri/prepare', body: {
        'companyId': companyId, 'xml': xml, 'certificadoP12': p12, 'clave': clave,
      }));

  Future<Map<String, dynamic>> operar(String companyId, String id, String operacion) async =>
      Map<String, dynamic>.from(await _api.post('/api/sri/documents/$id/$operacion', body: {'companyId': companyId}));

  Future<Map<String, dynamic>> detalle(String companyId, String id) async =>
      Map<String, dynamic>.from(await _api.get('/api/sri/documents/$id', query: {'companyId': companyId}));
}
