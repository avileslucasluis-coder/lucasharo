import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'api_config.dart';
import 'api_exception.dart';
import 'session_storage.dart';

/// Envoltorio sobre `http` que:
///  - agrega el header Authorization con el access token en cada llamada;
///  - si el backend responde 401, intenta refrescar el token UNA vez y
///    reintenta la llamada original — así una sesión larga no obliga a
///    reloguear cada 15 minutos (duración del access token);
///  - si el refresh también falla, llama a [onSesionInvalida] para que la
///    app pueda mandar al usuario de vuelta al login;
///  - decodifica JSON y traduce errores del backend a [ApiException] con
///    el mensaje que NestJS ya trae listo para mostrar al usuario.
class ApiClient {
  final SessionStorage _session;
  final FutureOr<void> Function() onSesionInvalida;
  final http.Client _http;
  final Duration requestTimeout;
  Future<bool>? _refreshPendiente;

  ApiClient(this._session, {
    required this.onSesionInvalida,
    http.Client? httpClient,
    this.requestTimeout = const Duration(seconds: 30),
  }) : _http = httpClient ?? http.Client();

  void close() => _http.close();

  Future<http.Response> _enviar(Future<http.Response> Function() enviar) async {
    try {
      return await enviar().timeout(requestTimeout);
    } on TimeoutException {
      throw ApiException(0, 'El servidor tardó demasiado en responder. Intenta de nuevo.');
    } on http.ClientException {
      throw ApiException(0, 'No se pudo conectar con el servidor. Comprueba tu conexión y que el sistema esté iniciado.');
    }
  }

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('${ApiConfig.baseUrl}$path').replace(queryParameters: query);

  Future<dynamic> get(String path, {Map<String, String>? query}) =>
      _request('GET', path, query: query);

  Future<dynamic> post(String path, {Object? body}) =>
      _request('POST', path, body: body);

  Future<dynamic> _request(
    String method,
    String path, {
    Map<String, String>? query,
    Object? body,
    bool esReintento = false,
  }) async {
    final token = await _session.accessToken;
    final headers = {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };

    late http.Response respuesta;
    final uri = _uri(path, query);
    switch (method) {
      case 'GET':
        respuesta = await _enviar(() => _http.get(uri, headers: headers));
        break;
      case 'POST':
        respuesta = await _enviar(() => _http.post(uri, headers: headers, body: body != null ? jsonEncode(body) : null));
        break;
      default:
        throw ApiException(0, 'Método HTTP no soportado: $method');
    }

    if (respuesta.statusCode == 401 && !esReintento && !path.startsWith('/api/auth')) {
      final tokenActual = await _session.accessToken;
      final seRefresco = tokenActual != null && tokenActual != token
          ? true
          : await _refrescarUnaVez();
      if (seRefresco) {
        return _request(method, path, query: query, body: body, esReintento: true);
      }
      await onSesionInvalida();
      throw ApiException(401, 'Tu sesión expiró, inicia sesión de nuevo.');
    }

    if (respuesta.statusCode == 401 && esReintento) {
      await onSesionInvalida();
    }

    if (respuesta.statusCode >= 200 && respuesta.statusCode < 300) {
      if (respuesta.body.isEmpty) return null;
      return jsonDecode(utf8.decode(respuesta.bodyBytes));
    }

    String mensaje = 'Ocurrió un error inesperado (${respuesta.statusCode}).';
    try {
      final decodificado = jsonDecode(utf8.decode(respuesta.bodyBytes));
      final m = decodificado['message'];
      if (m is String) mensaje = m;
      if (m is List && m.isNotEmpty) mensaje = m.join(' — ');
    } catch (_) {
      // el cuerpo no era JSON — se deja el mensaje genérico
    }
    throw ApiException(respuesta.statusCode, mensaje);
  }

  Future<bool> _refrescarUnaVez() async {
    if (_refreshPendiente != null) return _refreshPendiente!;
    final pendiente = _intentarRefrescarToken();
    _refreshPendiente = pendiente;
    try {
      return await pendiente;
    } finally {
      _refreshPendiente = null;
    }
  }

  Future<bool> _intentarRefrescarToken() async {
    final refreshToken = await _session.refreshToken;
    if (refreshToken == null) return false;
    try {
      final respuesta = await _enviar(() => _http.post(
        _uri('/api/auth/refresh'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'refreshToken': refreshToken}),
      ));
      if (respuesta.statusCode != 201 && respuesta.statusCode != 200) return false;
      final data = jsonDecode(utf8.decode(respuesta.bodyBytes));
      await _session.guardar(accessToken: data['accessToken'], refreshToken: data['refreshToken']);
      return true;
    } on ApiException {
      rethrow;
    } catch (_) {
      return false;
    }
  }
}
