import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../services/api_exception.dart';

class CompleteIdentityScreen extends StatefulWidget {
  final AuthService auth;
  const CompleteIdentityScreen({super.key, required this.auth});
  @override
  State<CompleteIdentityScreen> createState() => _CompleteIdentityScreenState();
}

class _CompleteIdentityScreenState extends State<CompleteIdentityScreen> {
  final _form = GlobalKey<FormState>();
  final _document = TextEditingController();
  bool _saving = false;
  String? _error;
  @override
  void dispose() { _document.dispose(); super.dispose(); }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() { _saving = true; _error = null; });
    try {
      await widget.auth.completarIdentificacion(_document.text);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    } catch (_) {
      if (mounted) setState(() => _error = 'No se pudo guardar. Intenta nuevamente.');
    } finally { if (mounted) setState(() => _saving = false); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Completa tu cuenta')),
    body: Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 480),
      child: ListView(shrinkWrap: true, padding: const EdgeInsets.all(24), children: [
        Text(widget.auth.email ?? ''),
        const SizedBox(height: 16),
        const Text('Tu cuenta se creó con correo. Agrega tu cédula o RUC para continuar. Conservarás tus datos y podrás usar esta identificación para iniciar sesión.'),
        const SizedBox(height: 24),
        Form(key: _form, child: TextFormField(
          controller: _document, enabled: !_saving, keyboardType: TextInputType.number,
          maxLength: 13, decoration: const InputDecoration(labelText: 'Cédula o RUC'),
          validator: (v) => RegExp(r'^(?:[0-9]{10}|[0-9]{13})$').hasMatch(v?.trim() ?? '')
            ? null : 'Cédula: 10 dígitos. RUC: 13 dígitos.',
        )),
        if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
        FilledButton(onPressed: _saving ? null : _save, child: Text(_saving ? 'Guardando…' : 'Guardar y continuar')),
        TextButton(onPressed: _saving ? null : widget.auth.logout, child: const Text('Cerrar sesión')),
      ]))),
  );
}
