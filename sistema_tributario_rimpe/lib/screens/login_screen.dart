import 'package:flutter/material.dart';
import 'help_screen.dart';
import '../services/auth_service.dart';
import '../services/api_exception.dart';
import '../utils/app_theme.dart';

class LoginScreen extends StatefulWidget {
  final AuthService auth;
  const LoginScreen({super.key, required this.auth});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _ruc = TextEditingController();
  final _password = TextEditingController();
  bool _mostrarPassword = false;
  final _nombre = TextEditingController();
  bool _modoRegistro = false;
  bool _cargando = false;
  String? _error;

  Future<void> _recuperar() async {
    await showDialog<void>(context: context, builder: (context) => AlertDialog(
      title: const Text('Ayuda para recuperar acceso'),
      content: const Text('Las cuentas nuevas se registran sin correo. Si olvidaste tu contraseña, solicita al administrador que verifique tu identidad y te ayude a recuperar el acceso.'),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Entendido'))],
    ));
  }

  @override
  void dispose() {
    _ruc.dispose();
    _password.dispose();
    _nombre.dispose();
    super.dispose();
  }

  Future<void> _enviar() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      if (_modoRegistro) {
        await widget.auth.registrar('', _password.text, _nombre.text.trim(), _ruc.text.trim());
      } else {
        await widget.auth.login(_ruc.text.trim(), _password.text);
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.mensaje);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'No se pudo conectar con el servidor. Verifica que el backend esté corriendo.');
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ClipRRect(borderRadius: BorderRadius.circular(16), child: Image.asset('assets/branding/logo.png', width: 72, height: 72, semanticLabel: 'Sistema Tributario')),
                  const SizedBox(height: 12),
                  const Text('Dayanex · Declaraciones',
                      style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold), textAlign: TextAlign.center),
                  const SizedBox(height: 4),
                  Text(_modoRegistro ? 'Crea tu cuenta' : 'Inicia sesión para continuar',
                      style: TextStyle(color: Colors.grey.shade600)),
                  const SizedBox(height: 28),
                  if (_modoRegistro) ...[
                    TextFormField(
                      controller: _nombre,
                      decoration: const InputDecoration(labelText: 'Nombre completo'),
                      validator: (v) => (v == null || v.trim().isEmpty) ? 'Campo requerido' : null,
                    ),
                    const SizedBox(height: 12),
                  ],
                  ...[
                    TextFormField(
                      controller: _ruc,
                      decoration: const InputDecoration(labelText: 'Cédula o RUC', helperText: 'Tu espacio de declaraciones, en un solo lugar.'),
                      keyboardType: TextInputType.number,
                      maxLength: 13,
                      validator: (v) => RegExp(r'^(?:[0-9]{10}|[0-9]{13})$').hasMatch(v?.trim() ?? '') ? null : 'Cédula: 10 dígitos. RUC: 13 dígitos.',
                    ),
                    const SizedBox(height: 12),
                  ],
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _password,
                    decoration: InputDecoration(labelText: 'Contraseña', helperText: _modoRegistro ? 'Entre 8 y 10 caracteres' : null,
                      suffixIcon: IconButton(tooltip: _mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña',
                        icon: Icon(_mostrarPassword ? Icons.visibility_off : Icons.visibility),
                        onPressed: () => setState(() => _mostrarPassword = !_mostrarPassword))),
                    obscureText: !_mostrarPassword,
                    validator: (v) => (v == null || v.isEmpty)
                        ? 'Campo requerido'
                        : (_modoRegistro && (v.runes.length < 8 || v.runes.length > 10)) ? 'Entre 8 y 10 caracteres' : null,
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: TextStyle(color: AppTheme.danger), textAlign: TextAlign.center),
                  ],
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _cargando ? null : _enviar,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: _cargando
                            ? const SizedBox(
                                width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : Text(_modoRegistro ? 'Crear cuenta' : 'Ingresar'),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const HelpScreen())), child: const Text('Ayuda, soporte y privacidad')),
                  if (!_modoRegistro)
                    TextButton(
                      onPressed: _cargando ? null : _recuperar,
                      child: const Text('Olvidé mi contraseña'),
                    ),
                  TextButton(
                    onPressed: _cargando ? null : () => setState(() => _modoRegistro = !_modoRegistro),
                    child: Text(_modoRegistro
                        ? '¿Ya tienes cuenta? Inicia sesión'
                        : '¿No tienes cuenta? Regístrate'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
