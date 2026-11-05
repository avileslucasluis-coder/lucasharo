import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:share_plus/share_plus.dart';
import '../models/company.dart';
import '../models/obligacion.dart';
import '../services/company_service.dart';
import '../services/tax_obligations_service.dart';
import '../services/api_exception.dart';
import '../utils/app_theme.dart';

class ObligacionesScreen extends StatefulWidget {
  final CompanyService companies;
  final TaxObligationsService obligations;
  const ObligacionesScreen({super.key, required this.companies, required this.obligations});

  @override
  State<ObligacionesScreen> createState() => _ObligacionesScreenState();
}

class _ObligacionesScreenState extends State<ObligacionesScreen> {
  List<Company> _empresas = [];
  Company? _seleccionada;
  int _mes = DateTime.now().month;
  int _anio = DateTime.now().year;
  List<ObligacionApi> _obligaciones = [];
  bool _cargando = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _cargarEmpresas();
  }

  Future<void> _cargarEmpresas() async {
    try {
      final lista = await widget.companies.listar();
      if (!mounted) return;
      setState(() {
        _empresas = lista;
        _seleccionada = lista.isNotEmpty ? lista.first : null;
      });
      if (_seleccionada != null) await _evaluar();
      if (!mounted) return;
      setState(() => _cargando = false);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.mensaje;
        _cargando = false;
      });
    }
  }

  Future<void> _evaluar() async {
    if (_seleccionada == null) return;
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final lista = await widget.obligations.evaluar(companyId: _seleccionada!.id, mes: _mes, anio: _anio);
      if (!mounted) return;
      setState(() {
        _obligaciones = lista;
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

  Future<void> _revisarFecha(ObligacionApi o) async {
    final fecha = TextEditingController(text: o.fechaVencimiento?.toIso8601String().substring(0, 10));
    final fuente = TextEditingController();
    final motivo = TextEditingController();
    final form = GlobalKey<FormState>();
    final accepted = await showDialog<bool>(context: context, builder: (context) => AlertDialog(
      title: const Text('Confirmar vencimiento'),
      content: SizedBox(width: 440, child: SingleChildScrollView(child: Form(key: form, child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Text('Solo el administrador de la empresa puede confirmar una fecha. Registra la resolución o calendario del SRI aplicable a esta empresa y período.'),
        TextFormField(controller: fecha, decoration: const InputDecoration(labelText: 'Fecha AAAA-MM-DD'), validator: (v) => RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(v ?? '') ? null : 'Revisa la fecha'),
        TextFormField(controller: fuente, decoration: const InputDecoration(labelText: 'Enlace oficial del SRI'), validator: (v) => RegExp(r'^https://(www\.)?sri\.gob\.ec/').hasMatch(v ?? '') ? null : 'Usa un enlace oficial HTTPS'),
        TextFormField(controller: motivo, maxLength: 1000, decoration: const InputDecoration(labelText: 'Fundamento y ámbito aplicable'), validator: (v) => (v?.trim().length ?? 0) >= 10 ? null : 'Explica el fundamento'),
      ])))), actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')), FilledButton(onPressed: () { if (form.currentState!.validate()) Navigator.pop(context, true); }, child: const Text('Guardar'))],
    ));
    if (accepted == true) {
      try {
        await widget.obligations.api.post('/api/tax/obligations/deadline', body: {'companyId': _seleccionada!.id, 'mes': _mes, 'anio': _anio, 'tipo': o.tipo, 'fecha': fecha.text, 'fuente': fuente.text, 'motivo': motivo.text.trim()});
        await _evaluar();
      } on ApiException catch (e) { if (mounted) setState(() => _error = e.mensaje); }
    }
    fecha.dispose(); fuente.dispose(); motivo.dispose();
  }

  Future<void> _calendario() async {
    final lines = <String>['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sistema Tributario//Vencimientos//ES'];
    for (final o in _obligaciones.where((o) => o.fechaVencimiento != null && o.estado != 'NO_OBLIGADO')) {
      final date = o.fechaVencimiento!.toIso8601String().substring(0,10).replaceAll('-', '');
      lines.addAll(['BEGIN:VEVENT', 'UID:${_seleccionada!.id}-$_anio-$_mes-${o.tipo}@sistema-tributario', 'DTSTAMP:${DateTime.now().toUtc().toIso8601String().replaceAll('-', '').replaceAll(':', '').split('.').first}Z', 'DTSTART;VALUE=DATE:$date', 'SUMMARY:Vencimiento ${o.tipo}', 'DESCRIPTION:Revisa fecha y alcance en Sistema Tributario antes de presentar.', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P3D', 'DESCRIPTION:Revisar obligación tributaria', 'END:VALARM', 'END:VEVENT']);
    }
    lines.add('END:VCALENDAR');
    await Share.shareXFiles([XFile.fromData(utf8.encode(lines.join('\r\n') + '\r\n'), mimeType: 'text/calendar', name: 'vencimientos.ics')], fileNameOverrides: ['vencimientos.ics']);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mis obligaciones tributarias')),
      body: _empresas.isEmpty && !_cargando
          ? Center(child: Text('Registra una empresa primero.', style: TextStyle(color: Colors.grey.shade600)))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(
                  'El sistema evalúa el régimen y los datos registrados de la empresa — nunca asume '
                  'que todas las empresas deben presentar los mismos formularios.',
                  style: TextStyle(color: Colors.grey.shade600),
                ),
                const SizedBox(height: 16),
                if (_empresas.isNotEmpty)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          Expanded(
                            flex: 2,
                            child: DropdownButtonFormField<Company>(
                              value: _seleccionada,
                              decoration: const InputDecoration(labelText: 'Empresa'),
                              items: _empresas.map((c) => DropdownMenuItem(value: c, child: Text(c.razonSocial))).toList(),
                              onChanged: (v) {
                                setState(() => _seleccionada = v);
                                _evaluar();
                              },
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: DropdownButtonFormField<int>(
                              value: _mes,
                              decoration: const InputDecoration(labelText: 'Mes'),
                              items: List.generate(12, (i) => i + 1)
                                  .map((m) => DropdownMenuItem(value: m, child: Text('$m')))
                                  .toList(),
                              onChanged: (v) {
                                setState(() => _mes = v!);
                                _evaluar();
                              },
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                const SizedBox(height: 16),
                if (_cargando) const Center(child: CircularProgressIndicator()),
                if (_error != null) Text(_error!, style: TextStyle(color: AppTheme.danger)),
                if (!_cargando && _error == null)
                  ...[
                    OutlinedButton.icon(onPressed: _obligaciones.any((o) => o.fechaVencimiento != null) ? _calendario : null, icon: const Icon(Icons.calendar_month), label: const Text('Exportar recordatorios al calendario')),
                    ..._obligaciones.map((o) => Column(children: [
                      _TarjetaObligacion(obligacion: o),
                      if (o.fechaVencimiento != null) TextButton(onPressed: () => _revisarFecha(o), child: const Text('Confirmar fecha con fuente del SRI')),
                    ])),
                  ],
              ],
            ),
    );
  }
}

class _TarjetaObligacion extends StatelessWidget {
  final ObligacionApi obligacion;
  const _TarjetaObligacion({required this.obligacion});

  Color get _color {
    switch (obligacion.estado) {
      case 'OBLIGATORIO':
        return AppTheme.primary;
      case 'VENCIDO':
        return AppTheme.danger;
      case 'PENDIENTE_INFORMACION':
        return AppTheme.accent;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(obligacion.icono, style: const TextStyle(fontSize: 18)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(obligacion.nombre, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                ),
                Chip(
                  label: Text(obligacion.estado.replaceAll('_', ' ')),
                  backgroundColor: _color.withOpacity(0.12),
                  labelStyle: TextStyle(color: _color, fontSize: 11, fontWeight: FontWeight.bold),
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (obligacion.formulario != null)
              Text('Formulario: ${obligacion.formulario} · ${obligacion.periodicidad.replaceAll('_', ' ')}',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
            const SizedBox(height: 6),
            Text(obligacion.motivo, style: const TextStyle(fontSize: 13)),
            if (obligacion.fechaVencimiento != null) ...[
              const SizedBox(height: 6),
              Text('Vence: ${Formatters.date.format(obligacion.fechaVencimiento!)}',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: _color)),
            ],
            const SizedBox(height: 4),
            Text(obligacion.baseLegal, style: TextStyle(fontSize: 11, color: Colors.grey.shade500, fontStyle: FontStyle.italic)),
          ],
        ),
      ),
    );
  }
}
