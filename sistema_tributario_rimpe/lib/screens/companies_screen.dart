import 'package:flutter/material.dart';
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

  Future<void> _abrirFormulario() async {
    final creada = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _FormularioEmpresa(companies: widget.companies),
    );
    if (mounted && creada == true) await _cargar();
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
                        padding: const EdgeInsets.all(16),
                        itemCount: _lista.length,
                        itemBuilder: (context, i) {
                          final c = _lista[i];
                          return Card(
                            child: ListTile(
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
                              trailing: c.miRol != null
                                  ? Chip(label: Text(c.miRol!), visualDensity: VisualDensity.compact)
                                  : null,
                            ),
                          );
                        },
                      ),
      ),
    );
  }
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
  const _FormularioEmpresa({required this.companies});

  @override
  State<_FormularioEmpresa> createState() => _FormularioEmpresaState();
}

class _FormularioEmpresaState extends State<_FormularioEmpresa> {
  final _formKey = GlobalKey<FormState>();
  final _ruc = TextEditingController();
  final _razonSocial = TextEditingController();
  final _nombreComercial = TextEditingController();
  final _actividadEconomica = TextEditingController();
  String _regimen = 'RIMPE_EMPRENDEDOR';
  bool _guardando = false;
  String? _error;

  @override
  void dispose() {
    _ruc.dispose();
    _razonSocial.dispose();
    _nombreComercial.dispose();
    _actividadEconomica.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _guardando = true;
      _error = null;
    });
    try {
      await widget.companies.crear(
        ruc: _ruc.text.trim(),
        razonSocial: _razonSocial.text.trim(),
        nombreComercial: _nombreComercial.text.trim(),
        regimen: _regimen,
        actividadEconomica: _actividadEconomica.text.trim(),
      );
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
                const Text('Nueva empresa', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                const SizedBox(height: 20),
                TextFormField(
                  controller: _ruc,
                  decoration: const InputDecoration(labelText: 'RUC'),
                  keyboardType: TextInputType.number,
                  validator: (v) => (v == null || v.trim().length != 13) ? 'El RUC debe tener 13 dígitos' : null,
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
                        : const Text('Crear empresa'),
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
