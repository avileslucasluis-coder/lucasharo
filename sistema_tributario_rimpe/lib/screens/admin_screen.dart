import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../services/api_exception.dart';

class AdminScreen extends StatefulWidget {
  final ApiClient api;
  const AdminScreen({super.key, required this.api});
  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> {
  List<dynamic> _users = [];
  bool _loading = true;
  bool _mail = false;
  String? _currentUserId;
  String? _error;
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final status = await widget.api.get('/api/admin/status');
      final users = await widget.api.get('/api/admin/users');
      if (mounted) setState(() { _mail = status['mailConfigured'] == true; _currentUserId = status['currentUserId']; _users = users as List; });
    } catch (_) {
      if (mounted) setState(() => _error = 'No se pudo acceder al panel administrativo.');
    } finally { if (mounted) setState(() => _loading = false); }
  }
  Future<void> _toggle(dynamic user) async {
    final active = user['activo'] != true;
    final confirm = await showDialog<bool>(context: context, builder: (context) => AlertDialog(
      title: Text(active ? 'Activar cuenta' : 'Suspender cuenta'),
      content: Text('Se cambiará el acceso de ${user['nombre']} y se cerrarán sus sesiones.'),
      actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
        TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Confirmar'))],
    ));
    if (confirm != true || !mounted) return;
    setState(() => _loading = true);
    try {
      await widget.api.post('/api/admin/users/${user['id']}/status', body: {'activo': active});
      await _load();
    } catch (_) { if (mounted) setState(() { _loading = false; _error = 'No se pudo cambiar el acceso.'; }); }
  }

  Future<void> _edit(dynamic user) async {
    var nombre = user['nombre'] as String? ?? '';
    var identity = user['ruc'] as String? ?? '';
    final form = GlobalKey<FormState>();
    final values = await showDialog<Map<String, String>>(context: context, builder: (context) => AlertDialog(
      title: const Text('Editar datos de la cuenta'),
      content: SingleChildScrollView(child: Form(key: form, child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text('${user['email']}'),
        const SizedBox(height: 16),
        TextFormField(initialValue: nombre, onChanged: (v) => nombre = v, maxLength: 160, decoration: const InputDecoration(labelText: 'Nombre completo'),
          validator: (v) => (v ?? '').trim().isEmpty ? 'Ingresa el nombre.' : null),
        TextFormField(initialValue: identity, onChanged: (v) => identity = v, maxLength: 13, keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Cédula o RUC'),
          validator: (v) => RegExp(r'^(?:[0-9]{10}|[0-9]{13})$').hasMatch((v ?? '').trim()) ? null : 'Ingresa 10 o 13 dígitos.'),
        const Text('Al cambiar la identificación se cerrarán sus sesiones. La persona deberá ingresar con su nueva cédula o RUC y su contraseña actual. Los datos tributarios de sus empresas se editan en Empresas.'),
      ]))),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
        FilledButton(onPressed: () { if (form.currentState!.validate()) Navigator.pop(context, {'nombre': nombre.trim(), 'ruc': identity.trim()}); }, child: const Text('Guardar cambios'))],
    ));
    if (values == null || !mounted) return;
    setState(() { _loading = true; _error = null; });
    try {
      await widget.api.post('/api/admin/users/${user['id']}/profile', body: values);
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Datos de la cuenta actualizados.')));
    } on ApiException catch (e) {
      if (mounted) setState(() { _loading = false; _error = e.mensaje; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = 'No se pudieron guardar los cambios.'; });
    }
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Administración'), actions: [IconButton(onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh))]),
    body: _loading ? const Center(child: CircularProgressIndicator()) : ListView(padding: const EdgeInsets.all(20), children: [
      if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
      Text(_mail ? 'Correo configurado; la entrega debe verificarse con el proveedor.' : 'Correo pendiente: configura proveedor y remitente para recuperar contraseñas.'),
      const SizedBox(height: 16),
      const Text('Últimas 100 cuentas. Las actualizaciones de la aplicación se publican desde Vercel.'),
      ..._users.map((u) => Card(child: ListTile(
        title: Text(u['nombre'] as String), subtitle: Text('${u['ruc'] ?? 'Sin identificación'} · ${u['email']}\n'
          '${u['platformAdmin'] == true ? 'Administrador' : 'Usuario'} · ${u['activo'] == true ? 'Activo' : 'Suspendido'}'),
        trailing: u['id'] == _currentUserId ? const Text('Tu cuenta · Admin') : PopupMenuButton<String>(
          tooltip: 'Administrar cuenta',
          onSelected: (action) { if (action == 'edit') { _edit(u); } else if (action == 'role') { _changeRole(u); } else { _toggle(u); } },
          itemBuilder: (_) => [
            const PopupMenuItem(value: 'edit', child: Text('Editar nombre y cédula / RUC')),
            if (u['activo'] == true || u['platformAdmin'] == true)
              PopupMenuItem(value: 'role', child: Text(u['platformAdmin'] == true ? 'Retirar administrador' : 'Hacer administrador')),
            if (u['platformAdmin'] != true)
              PopupMenuItem(value: 'status', child: Text(u['activo'] == true ? 'Suspender' : 'Activar')),
          ],
        ),
      ))),
    ]),
  );

  Future<void> _changeRole(dynamic user) async {
    final grant = user['platformAdmin'] != true;
    final confirmed = await showDialog<bool>(context: context, builder: (context) => AlertDialog(
      title: Text(grant ? 'Dar acceso administrativo' : 'Retirar acceso administrativo'),
      content: Text('${user['nombre']} (${user['email']})\n\n'
        '${grant ? 'Podrá administrar cuentas y otorgar o retirar este rol a otras personas. Tu cuenta conservará su acceso.' : 'Dejará de tener acceso al panel administrativo.'}\n\nSus sesiones se cerrarán y deberá iniciar sesión otra vez.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
        TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Confirmar')),
      ],
    ));
    if (confirmed != true || !mounted) return;
    setState(() { _loading = true; _error = null; });
    try {
      await widget.api.post('/api/admin/users/${user['id']}/admin-role', body: {'platformAdmin': grant});
      await _load();
    } on ApiException catch (e) {
      if (mounted) setState(() { _loading = false; _error = e.mensaje; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = 'No se pudo cambiar el rol administrativo.'; });
    }
  }
}
