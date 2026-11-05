import 'package:shared_preferences/shared_preferences.dart';

/// Conserva tokens en memoria; cerrar la aplicación requiere iniciar sesión.
/// Elimina las credenciales persistidas por versiones anteriores.
class SessionStorage {
  String? _access;
  String? _refresh;
  Future<void>? _legacyCleanup;
  static const _kAccessToken = 'session_access_token';
  static const _kRefreshToken = 'session_refresh_token';

  Future<void> guardar({required String accessToken, required String refreshToken}) async {
      await limpiar();
      _access = accessToken;
      _refresh = refreshToken;
  }

  Future<String?> get accessToken async {
    await (_legacyCleanup ??= _removeLegacy());
    return _access;
  }

  Future<String?> get refreshToken async =>
      _refresh;

  Future<void> limpiar() async {
    _access = null;
    _refresh = null;
    await _removeLegacy();
  }

  Future<void> _removeLegacy() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kAccessToken);
    await prefs.remove(_kRefreshToken);
  }
}
