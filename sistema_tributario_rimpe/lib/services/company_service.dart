import '../models/company.dart';
import 'api_client.dart';

class CompanyService {
  final ApiClient api;
  CompanyService(this.api);

  Future<Company> editar(String id, Map<String, dynamic> datos) async =>
    Company.fromJson(await api.post('/api/companies/$id/editar', body: datos));

  Future<Map<String, dynamic>> respaldo(String id) async =>
    Map<String, dynamic>.from(await api.get('/api/companies/$id/respaldo'));

  Future<void> eliminar(String id, String confirmarRuc) async {
    await api.post('/api/companies/$id/eliminar', body: {'confirmarRuc': confirmarRuc});
  }

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
    String? direccion,
    String? telefono,
    bool? obligadoLlevarContabilidad,
    bool? esContribuyenteEspecial,
    bool? esAgenteRetencion,
  }) async {
    final data = await api.post('/api/companies', body: {
      'ruc': ruc,
      'razonSocial': razonSocial,
      if (nombreComercial != null && nombreComercial.isNotEmpty) 'nombreComercial': nombreComercial,
      'regimen': regimen,
      if (direccion != null) 'direccion': direccion,
      if (telefono != null) 'telefono': telefono,
      if (actividadEconomica != null && actividadEconomica.isNotEmpty) 'actividadEconomica': actividadEconomica,
      if (obligadoLlevarContabilidad != null) 'obligadoLlevarContabilidad': obligadoLlevarContabilidad,
      if (esContribuyenteEspecial != null) 'esContribuyenteEspecial': esContribuyenteEspecial,
      if (esAgenteRetencion != null) 'esAgenteRetencion': esAgenteRetencion,
    });
    return Company.fromJson(data);
  }
}
