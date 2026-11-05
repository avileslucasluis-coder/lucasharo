import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:share_plus/share_plus.dart';
import '../models/company.dart';
import '../services/company_service.dart';
import '../services/api_exception.dart';
import '../utils/app_theme.dart';
import 'tax_profile_screen.dart';

class CompaniesScreen extends StatefulWidget {
  final CompanyService companies;
  const CompaniesScreen({super.key, required this.companies});

  @override
  State<CompaniesScreen> createState() => _CompaniesScreenState();
}

class _CompaniesScreenState extends State<CompaniesScreen> {
  List<Company> _lista = [];
  bool _cargando = true;
  String? _error;
  String? _descargando;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final lista = await widget.companies.listar();
      if (!mounted) return;
      setState(() {
        _lista = lista;
        _cargando = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.mensaje;
        _cargando = false;
      });
    }
  }

  Future<void> _abrirFormulario([Company? empresa]) async {
    final creada = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _FormularioEmpresa(companies: widget.companies, empresa: empresa),
    );
    if (mounted && creada == true) await _cargar();
  }

  Future<void> _descargar(Company empresa) async {
    setState(() => _descargando = empresa.id);
    try {
      final backup = await widget.companies.respaldo(empresa.id);
      if (!mounted) return;
      await Share.shareXFiles([XFile.fromData(base64Decode(backup['contentBase64']),
        name: backup['filename'], mimeType: backup['mimeType'])],
        fileNameOverrides: [backup['filename']], subject: 'Respaldo de ${empresa.razonSocial}');
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(
        e is ApiException ? e.mensaje : 'No se pudo descargar el respaldo. Intenta nuevamente.')));
    } finally {
      if (mounted) setState(() => _descargando = null);
    }
  }

  Future<void> _eliminar(Company empresa) async {
    final deleted = await showDialog<bool>(context: context, barrierDismissible: false,
      builder: (_) => _EliminarEmpresaDialog(empresa: empresa, companies: widget.companies));
    if (mounted && deleted == true) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Empresa eliminada.')));
      await _cargar();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Empresas')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _abrirFormulario,
        icon: const Icon(Icons.domain_add),
        label: const Text('Nueva empresa'),
      ),
      body: RefreshIndicator(
        onRefresh: _cargar,
        child: _cargando
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? ListView(children: [_MensajeError(mensaje: _error!, onReintentar: _cargar)])
                : _lista.isEmpty
                    ? ListView(
                        children: [
                          Padding(
                            padding: const EdgeInsets.all(32),
                            child: Text(
                              'No perteneces a ninguna empresa todavía.\nToca "Nueva empresa" para crear una — quedarás como su administrador.',
                              textAlign: TextAlign.center,
                              style: TextStyle(color: Colors.grey.shade600),
                            ),
                          ),
                        ],
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                        itemCount: _lista.length,
                        itemBuilder: (context, i) {
                          final c = _lista[i];
                          return Card(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [ListTile(
                              leading: CircleAvatar(
                                backgroundColor: AppTheme.primary.withOpacity(0.1),
                                child: Text(
                                  c.razonSocial.isNotEmpty ? c.razonSocial[0].toUpperCase() : '?',
                                  style: TextStyle(color: AppTheme.primary, fontWeight: FontWeight.bold),
                                ),
                              ),
                              title: Text(c.razonSocial),
                              onTap: ['ADMIN_EMPRESA', 'SUPER_ADMIN'].contains(c.miRol)
                                  ? () async {
                                      final saved = await Navigator.push<bool>(context,
                                        MaterialPageRoute(builder: (_) => TaxProfileScreen(
                                          company: c, service: widget.companies)));
                                      if (mounted && saved == true) await _cargar();
                                    }
                                  : null,
                              subtitle: Text('RUC: ${c.ruc} · ${c.regimenLabel}'
                                '${['ADMIN_EMPRESA', 'SUPER_ADMIN'].contains(c.miRol) ? '\nToca para editar el perfil tributario' : ''}'),
                            ),
                              if (['ADMIN_EMPRESA', 'SUPER_ADMIN'].contains(c.miRol))
                                Padding(padding: const EdgeInsets.fromLTRB(12, 0, 12, 12), child: Wrap(spacing: 8, runSpacing: 4, children: [
                                  TextButton.icon(onPressed: _descargando != null ? null : () => _abrirFormulario(c), icon: const Icon(Icons.edit_outlined), label: const Text('Editar datos')),
                                  TextButton.icon(onPressed: _descargando != null ? null : () => _descargar(c), icon: const Icon(Icons.download_outlined), label: Text(_descargando == c.id ? 'Preparando respaldo...' : 'Descargar todos los datos')),
                                  TextButton.icon(onPressed: _descargando != null ? null : () => _eliminar(c), style: TextButton.styleFrom(foregroundColor: AppTheme.danger), icon: const Icon(Icons.delete_outline), label: const Text('Eliminar empresa')),
                                ])),
                            ]),
                          );
                        },
                      ),
      ),
    );
  }
}

class _EliminarEmpresaDialog extends StatefulWidget {
  final Company empresa;
  final CompanyService companies;
  const _EliminarEmpresaDialog({required this.empresa, required this.companies});
  @override
  State<_EliminarEmpresaDialog> createState() => _EliminarEmpresaDialogState();
}

class _EliminarEmpresaDialogState extends State<_EliminarEmpresaDialog> {
  final _confirmacion = TextEditingController();
  bool _eliminando = false;
  String? _error;
  @override
  void dispose() { _confirmacion.dispose(); super.dispose(); }

  Future<void> _eliminar() async {
    setState(() { _eliminando = true; _error = null; });
    try {
      await widget.companies.eliminar(widget.empresa.id, _confirmacion.text.trim());
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiException ? e.mensaje : 'No se pudo eliminar la empresa. Intenta nuevamente.');
    } finally {
      if (mounted) setState(() => _eliminando = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(canPop: !_eliminando, child: AlertDialog(
    title: const Text('Eliminar definitivamente'),
    content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('${widget.empresa.razonSocial}\nRUC: ${widget.empresa.ruc}', style: const TextStyle(fontWeight: FontWeight.bold)),
      const SizedBox(height: 12),
      const Text('Se borrarán la empresa, sus facturas, retenciones, declaraciones, archivos e historial para todos sus usuarios. Esta acción no se puede deshacer.\n\nSi deseas conservar una copia, cancela y usa “Descargar todos los datos” primero.'),
      const SizedBox(height: 16),
      TextField(controller: _confirmacion, enabled: !_eliminando, keyboardType: TextInputType.number,
        decoration: const InputDecoration(labelText: 'Escribe el RUC para confirmar'), onChanged: (_) => setState(() {})),
      if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: TextStyle(color: AppTheme.danger))),
    ])),
    actions: [
      TextButton(onPressed: _eliminando ? null : () => Navigator.pop(context, false), child: const Text('Cancelar')),
      FilledButton(onPressed: _eliminando || _confirmacion.text.trim() != widget.empresa.ruc ? null : _eliminar,
        style: FilledButton.styleFrom(backgroundColor: AppTheme.danger), child: Text(_eliminando ? 'Eliminando...' : 'Eliminar definitivamente')),
    ],
  ));
}

class _MensajeError extends StatelessWidget {
  final String mensaje;
  final VoidCallback onReintentar;
  const _MensajeError({required this.mensaje, required this.onReintentar});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        children: [
          Icon(Icons.cloud_off, size: 48, color: AppTheme.danger),
          const SizedBox(height: 12),
          Text(mensaje, textAlign: TextAlign.center),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: onReintentar, child: const Text('Reintentar')),
        ],
      ),
    );
  }
}

class _FormularioEmpresa extends StatefulWidget {
  final CompanyService companies;
  final Company? empresa;
  const _FormularioEmpresa({required this.companies, this.empresa});

  @override
  State<_FormularioEmpresa> createState() => _FormularioEmpresaState();
}

class _FormularioEmpresaState extends State<_FormularioEmpresa> {
  final _formKey = GlobalKey<FormState>();
  final _ruc = TextEditingController();
  final _razonSocial = TextEditingController();
  final _nombreComercial = TextEditingController();
  final _actividadEconomica = TextEditingController();
  final _direccion = TextEditingController();
  final _telefono = TextEditingController();
  String _regimen = 'RIMPE_EMPRENDEDOR';
  bool _guardando = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final c = widget.empresa;
    if (c != null) {
      _ruc.text = c.ruc; _razonSocial.text = c.razonSocial;
      _nombreComercial.text = c.nombreComercial ?? '';
      _actividadEconomica.text = c.actividadEconomica ?? '';
      _direccion.text = c.perfilTributario['direccion'] ?? '';
      _telefono.text = c.perfilTributario['telefono'] ?? '';
      _regimen = c.regimen;
    }
  }

  @override
  void dispose() {
    _ruc.dispose();
    _razonSocial.dispose();
    _nombreComercial.dispose();
    _actividadEconomica.dispose();
    _direccion.dispose();
    _telefono.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _guardando = true;
      _error = null;
    });
    try {
      if (widget.empresa != null) {
        await widget.companies.editar(widget.empresa!.id, {
          'ruc': _ruc.text.trim(), 'razonSocial': _razonSocial.text.trim(),
          'nombreComercial': _nombreComercial.text.trim(), 'actividadEconomica': _actividadEconomica.text.trim(),
          'regimen': _regimen, 'direccion': _direccion.text.trim(), 'telefono': _telefono.text.trim(),
        });
      } else {
        await widget.companies.crear(
        ruc: _ruc.text.trim(),
        razonSocial: _razonSocial.text.trim(),
        nombreComercial: _nombreComercial.text.trim(),
        regimen: _regimen,
        actividadEconomica: _actividadEconomica.text.trim(),
        direccion: _direccion.text.trim(), telefono: _telefono.text.trim(),
      );
      }
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.mensaje);
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      minChildSize: 0.5,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Form(
            key: _formKey,
            child: ListView(
              controller: scrollController,
              padding: const EdgeInsets.all(24),
              children: [
                Text(widget.empresa == null ? 'Nueva empresa' : 'Editar empresa', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                const SizedBox(height: 20),
                TextFormField(
                  controller: _ruc,
                  decoration: const InputDecoration(labelText: 'RUC'),
                  keyboardType: TextInputType.number,
                  validator: (v) => !RegExp(r'^\d{13}$').hasMatch(v?.trim() ?? '') ? 'El RUC debe tener 13 dígitos' : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _razonSocial,
                  decoration: const InputDecoration(labelText: 'Razón social'),
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Campo requerido' : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _nombreComercial,
                  decoration: const InputDecoration(labelText: 'Nombre comercial (opcional)'),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  isExpanded: true,
                  value: _regimen,
                  decoration: const InputDecoration(labelText: 'Régimen tributario'),
                  items: const [
                    DropdownMenuItem(value: 'RIMPE_EMPRENDEDOR', child: Text('RIMPE — Emprendedor')),
                    DropdownMenuItem(value: 'RIMPE_NEGOCIO_POPULAR', child: Text('RIMPE — Negocio Popular')),
                    DropdownMenuItem(value: 'GENERAL', child: Text('Régimen General')),
                  ],
                  onChanged: (v) => setState(() => _regimen = v!),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _actividadEconomica,
                  decoration: const InputDecoration(labelText: 'Actividad económica (opcional)'),
                ),
                const SizedBox(height: 12),
                TextFormField(controller: _direccion, maxLength: 300, decoration: const InputDecoration(labelText: 'Dirección (opcional)')),
                const SizedBox(height: 12),
                TextFormField(controller: _telefono, maxLength: 30, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Teléfono (opcional)')),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(color: AppTheme.danger)),
                ],
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _guardando ? null : _guardar,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: _guardando
                        ? const SizedBox(
                            width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : Text(widget.empresa == null ? 'Crear empresa' : 'Guardar cambios'),
                  ),
                ),
                const SizedBox(height: 12),
              ],
            ),
          ),
        );
      },
    );
  }
}
