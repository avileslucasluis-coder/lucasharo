import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/voucher.dart';
import 'api_client.dart';
import 'api_exception.dart';

class SriCompletion {
  bool activo = true;
  int total = 0, revisados = 0, completados = 0;
  final Map<String, String> errores = {};
  String? error;
  String get mensaje => activo
      ? total == 0 ? 'Buscando pendientes en el SRI...' : 'Consultando SRI: $revisados de $total · $completados completados'
      : error ?? (total == 0 ? 'No quedan comprobantes pendientes.' : '$completados completados con detalle del SRI · ${errores.length} pendientes de reintento');
}

class VoucherService extends ChangeNotifier {
  final ApiClient api;
  VoucherService(this.api);
  final _estados = <String, SriCompletion>{};
  final _trabajos = <String, Future<void>>{};
  bool _disposed = false;
  SriCompletion? estadoSri(String companyId) => _estados[companyId];

  void _notificar() { if (!_disposed) notifyListeners(); }

  @override
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    super.dispose();
  }

  // El trabajo pertenece a la sesión, no a una pantalla. Una sola cola por empresa.
  Future<void> completarPendientes(String companyId) {
    if (_disposed) return Future.value();
    final actual = _trabajos[companyId];
    if (actual != null) return actual;
    final estado = SriCompletion();
    _estados[companyId] = estado;
    final trabajo = _ejecutarPendientes(companyId, estado);
    _trabajos[companyId] = trabajo;
    _notificar();
    return trabajo;
  }

  Future<void> _ejecutarPendientes(String companyId, SriCompletion estado) async {
    try {
      final claves = await pendientesDetalle(companyId);
      estado.total = claves.length;
      _notificar();
      for (final clave in claves) {
        if (_disposed) return;
        if (estado.revisados > 0) await Future<void>.delayed(const Duration(milliseconds: 600));
        if (_disposed) return;
        try {
          try {
            await completarSri(companyId, clave);
          } on ApiException catch (e) {
            if (e.statusCode != 0 && e.statusCode < 500 && e.statusCode != 429) rethrow;
            await Future<void>.delayed(const Duration(seconds: 2));
            if (_disposed) return;
            await completarSri(companyId, clave);
          }
          estado.completados++;
        } catch (e) {
          estado.errores[clave] = e is ApiException ? e.mensaje : 'No se pudo consultar el detalle. Reintenta más tarde.';
          if (e is ApiException && [401, 403, 404].contains(e.statusCode)) {
            estado.error = e.mensaje;
            break;
          }
        }
        estado.revisados++;
        _notificar();
      }
    } catch (e) {
      estado.error = e is ApiException ? e.mensaje : 'No se pudieron consultar los pendientes.';
    } finally {
      estado.activo = false;
      _trabajos.remove(companyId);
      _notificar();
    }
  }

  Future<List<String>> pendientesDetalle(String companyId) async {
    final data = await api.get('/api/vouchers/pending-details', query: {'companyId': companyId}) as List;
    return data.map((v) => v['claveAcceso'] as String).toList();
  }

  Future<void> completarSri(String companyId, String claveAcceso) async {
    await api.post('/api/vouchers/complete-sri', body: {'companyId': companyId, 'claveAcceso': claveAcceso});
  }

  /// Envía el XML para leer sus impuestos reales y clasificar compra/venta.
  Future<Voucher> importarXml({required String companyId, required String xmlContent}) async {
    final data = await api.post('/api/vouchers/import', body: {
      'companyId': companyId,
      'xmlContent': xmlContent,
    });
    return Voucher.fromJson(data['voucher']);
  }

  Future<dynamic> importarTxt({required String companyId, required String contenido, required String sentido}) async {
    final result = await api.post('/api/vouchers/import-txt', body: {'companyId': companyId, 'txtContent': contenido, 'sentido': sentido});
    final anterior = _trabajos[companyId];
    // Una importación nueva puede llegar después de obtener la lista de la cola actual.
    if (anterior != null) {
      unawaited(anterior.then((_) => completarPendientes(companyId)));
    } else {
      unawaited(completarPendientes(companyId));
    }
    return result;
  }

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
