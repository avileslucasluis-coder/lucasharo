import 'package:flutter/foundation.dart';
import 'api_client.dart';
import 'session_storage.dart';

enum EstadoSesion { cargando, autenticado, noAutenticado, completarIdentificacion }

/// Estado global de sesión. RootApp escucha esto para decidir si muestra
/// LoginScreen o RootShell. El ApiClient llama a [cerrarSesionLocal]
/// automáticamente cuando un refresh token deja de servir, así la UI
/// reacciona sola sin que cada pantalla tenga que manejarlo.
class AuthService extends ChangeNotifier {
  final SessionStorage _session = SessionStorage();
  late final ApiClient api;

  EstadoSesion estado = EstadoSesion.cargando;
  String? email;
  bool platformAdmin = false;
  bool _disposed = false;

  void _applyProfile(dynamic profile) {
    platformAdmin = profile['platformAdmin'] == true;
    email = profile['email'] as String?;
    estado = RegExp(r'^(?:[0-9]{10}|[0-9]{13})$').hasMatch(profile['ruc'] as String? ?? '')
        ? EstadoSesion.autenticado : EstadoSesion.completarIdentificacion;
  }

  Future<void> completarIdentificacion(String documento) async {
    await api.post('/api/auth/identity', body: {'ruc': documento.trim()});
    _applyProfile(await api.get('/api/auth/me'));
    notifyListeners();
  }

  @override
  void notifyListeners() {
    if (!_disposed) super.notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    api.close();
    super.dispose();
  }

  AuthService() {
    api = ApiClient(_session, onSesionInvalida: cerrarSesionLocal);
    _cargarSesionExistente();
  }

  Future<void> _cargarSesionExistente() async {
    final token = await _session.accessToken;
    if (token != null) {
      try {
        final profile = await api.get('/api/auth/me');
        _applyProfile(profile);
      } catch (_) { estado = EstadoSesion.noAutenticado; }
    } else { estado = EstadoSesion.noAutenticado; }
    notifyListeners();
  }

  Future<void> login(String correo, String password) async {
    final data = await api.post('/api/auth/login', body: {correo.contains('@') ? 'email' : 'ruc': correo, 'password': password});
    await _session.guardar(accessToken: data['accessToken'], refreshToken: data['refreshToken']);
    email = correo;
    final profile = await api.get('/api/auth/me');
    _applyProfile(profile);
    notifyListeners();
  }

  Future<void> registrar(String correo, String password, String nombre, String ruc) async {
    final data = await api.post(
      '/api/auth/register',
      body: {if (correo.isNotEmpty) 'email': correo, 'password': password, 'nombre': nombre, 'ruc': ruc},
    );
    await _session.guardar(accessToken: data['accessToken'], refreshToken: data['refreshToken']);
    email = correo;
    final profile = await api.get('/api/auth/me');
    _applyProfile(profile);
    notifyListeners();
  }

  Future<void> logout() async {
    final refreshToken = await _session.refreshToken;
    if (refreshToken != null) {
      try {
        await api.post('/api/auth/logout', body: {'refreshToken': refreshToken});
      } catch (_) {
        // si el backend no responde igual cerramos la sesión localmente
      }
    }
    await cerrarSesionLocal();
  }

  Future<void> cerrarSesionLocal() async {
    await _session.limpiar();
    email = null;
    platformAdmin = false;
    estado = EstadoSesion.noAutenticado;
    notifyListeners();
  }
}
