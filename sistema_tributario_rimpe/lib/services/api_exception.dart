/// Error devuelto por el backend, con el mensaje tal como lo manda NestJS
/// (p. ej. "Credenciales inválidas.", "Tu rol no tiene permiso para esta
/// acción.") para mostrarlo directamente al usuario.
class ApiException implements Exception {
  final int statusCode;
  final String mensaje;
  ApiException(this.statusCode, this.mensaje);

  @override
  String toString() => mensaje;
}
