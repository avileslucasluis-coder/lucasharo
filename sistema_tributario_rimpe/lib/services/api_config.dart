import 'package:flutter/foundation.dart' show kIsWeb, kReleaseMode, defaultTargetPlatform, TargetPlatform;

/// URL base del backend. Por defecto apunta a un backend corriendo en
/// localhost durante desarrollo, con el ajuste especial que necesita el
/// emulador de Android (10.0.2.2 en vez de localhost, porque dentro del
/// emulador "localhost" se refiere al propio emulador, no a la máquina
/// anfitriona). Para producción, cambia [ApiConfig.baseUrl] antes de
/// correr la app (o conviértelo en una variable de entorno con
/// --dart-define).
class ApiConfig {
  static String baseUrl = const String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  ).isNotEmpty
      ? const String.fromEnvironment('API_BASE_URL')
      : _defaultParaPlataforma();

  static String _defaultParaPlataforma() {
    if (kIsWeb) {
      final pagina = Uri.base;
      if (kReleaseMode || pagina.port == 3000 || pagina.port == 80 || pagina.port == 443) {
        return pagina.origin;
      }
      return pagina.replace(port: 3000).origin;
    }
    if (defaultTargetPlatform == TargetPlatform.android || kReleaseMode) {
      return 'https://declaraciones-nine.vercel.app';
    }
    return 'http://localhost:3000';
  }
}
