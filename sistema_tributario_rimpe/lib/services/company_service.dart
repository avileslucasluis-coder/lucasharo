import '../models/company.dart';
import 'api_client.dart';

class CompanyService {
  final ApiClient api;
  CompanyService(this.api);

  Future<void> actualizarPerfil(String id, Map<String, dynamic> perfil) async {
    await api.post('/api/companies/$id/perfil-tributario', body: perfil);
  }

  Future<List<Company>> listar() async {
    final data = await api.get('/api/companies') as List;
    return data.map((e) => Company.fromJson(e)).toList();
  }

  Future<Company> crear({
    required String ruc,
    required String razonSocial,
    String? nombreComercial,
    required String regimen,
    String? actividadEconomica,
    bool? obligadoLlevarContabilidad,
    bool? esContribuyenteEspecial,
    bool? esAgenteRetencion,
  }) async {
    final data = await api.post('/api/companies', body: {
      'ruc': ruc,
      'razonSocial': razonSocial,
      if (nombreComercial != null && nombreComercial.isNotEmpty) 'nombreComercial': nombreComercial,
      'regimen': regimen,
      if (actividadEconomica != null && actividadEconomica.isNotEmpty) 'actividadEconomica': actividadEconomica,
      if (obligadoLlevarContabilidad != null) 'obligadoLlevarContabilidad': obligadoLlevarContabilidad,
      if (esContribuyenteEspecial != null) 'esContribuyenteEspecial': esContribuyenteEspecial,
      if (esAgenteRetencion != null) 'esAgenteRetencion': esAgenteRetencion,
    });
    return Company.fromJson(data);
  }
}
