import '../models/voucher.dart';
import 'api_client.dart';

class VoucherService {
  final ApiClient api;
  VoucherService(this.api);

  /// Sube el contenido crudo del XML al backend, que lo parsea, clasifica
  /// compra/venta y calcula la retención automática — el cliente ya no
  /// hace nada de eso localmente.
  Future<Voucher> importarXml({required String companyId, required String xmlContent}) async {
    final data = await api.post('/api/vouchers/import', body: {
      'companyId': companyId,
      'xmlContent': xmlContent,
    });
    return Voucher.fromJson(data['voucher']);
  }

  Future<dynamic> importarTxt({required String companyId, required String contenido, required String sentido}) => api.post('/api/vouchers/import-txt', body: {'companyId': companyId, 'txtContent': contenido, 'sentido': sentido});

  Future<List<Voucher>> listar({required String companyId, int? mes, int? anio}) async {
    final query = {
      'companyId': companyId,
      if (mes != null) 'mes': '$mes',
      if (anio != null) 'anio': '$anio',
    };
    final data = await api.get('/api/vouchers', query: query) as List;
    return data.map((e) => Voucher.fromJson(e)).toList();
  }
}
