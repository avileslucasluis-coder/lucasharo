import 'dart:convert';
import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../services/api_exception.dart';

class AtsOperationsScreen extends StatefulWidget {
  final ApiClient api;
  final String companyId;
  final int mes, anio;
  const AtsOperationsScreen(
      {super.key,
      required this.api,
      required this.companyId,
      required this.mes,
      required this.anio});
  @override
  State<AtsOperationsScreen> createState() => _AtsOperationsScreenState();
}

class _AtsOperationsScreenState extends State<AtsOperationsScreen> {
  List<dynamic>? _records;
  List<dynamic> _schemas = [], _vouchers = [];
  String? _error;
  Map<String, String> get _query => {
        'companyId': widget.companyId,
        'mes': '${widget.mes}',
        'anio': '${widget.anio}'
      };
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        widget.api.get('/api/ats/operations', query: _query),
        widget.api.get('/api/ats/operation-schemas',
            query: {'companyId': widget.companyId}),
        widget.api.get('/api/ats/review', query: _query),
      ]);
      if (mounted)
        setState(() {
          _records = results[0] as List;
          _schemas = results[1] as List;
          _vouchers = results[2] as List;
          _error = null;
        });
    } catch (e) {
      if (mounted)
        setState(() => _error = e is ApiException
            ? e.mensaje
            : 'No se pudieron consultar las operaciones.');
    }
  }

  Future<void> _edit([Map<String, dynamic>? record]) async {
    final saved = await Navigator.push<bool>(
        context,
        MaterialPageRoute(
            builder: (_) => _OperationEditor(
                  api: widget.api,
                  companyId: widget.companyId,
                  mes: widget.mes,
                  anio: widget.anio,
                  schemas: _schemas,
                  vouchers: _vouchers,
                  record: record,
                )));
    if (saved == true) await _load();
  }

  Future<void> _remove(Map<String, dynamic> record) async {
    final yes = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
              title: const Text('Eliminar operación'),
              content: const Text(
                  'Se retirará del ATS del período. La eliminación quedará registrada en la auditoría.'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Cancelar')),
                FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('Eliminar'))
              ],
            ));
    if (yes != true) return;
    try {
      await widget.api.post('/api/ats/operations/remove', body: {
        'companyId': widget.companyId,
        'id': record['id'],
        'version': record['version']
      });
      await _load();
    } catch (e) {
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content:
                Text(e is ApiException ? e.mensaje : 'No se pudo eliminar.')));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar:
            AppBar(title: Text('Operaciones ATS ${widget.mes}/${widget.anio}')),
        floatingActionButton: _records == null
            ? null
            : FloatingActionButton.extended(
                onPressed: () => _edit(),
                icon: const Icon(Icons.add),
                label: const Text('Nueva operación')),
        body: _error != null
            ? Center(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text(_error!),
                TextButton(onPressed: _load, child: const Text('Reintentar'))
              ]))
            : _records == null
                ? const Center(child: CircularProgressIndicator())
                : ListView(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                    children: [
                        const Text(
                            'Registra los documentos complementarios del período. Estos datos se incorporan al ATS; no presentan una declaración ni modifican el cálculo de IVA o renta.'),
                        const SizedBox(height: 16),
                        if (_records!.isEmpty)
                          const Text(
                              'Todavía no hay operaciones complementarias.'),
                        for (final raw in _records!)
                          Card(
                              child: ListTile(
                            title: Text(_schemas.firstWhere(
                                    (s) => s['kind'] == raw['kind'])['label']
                                as String),
                            subtitle: Text(
                                '${raw['reference']}\nRevisión ${raw['version']}'),
                            onTap: () => _edit(Map<String, dynamic>.from(raw)),
                            trailing: IconButton(
                                tooltip: 'Eliminar operación',
                                onPressed: () =>
                                    _remove(Map<String, dynamic>.from(raw)),
                                icon: const Icon(Icons.delete_outline)),
                          )),
                      ]),
      );
}

class _OperationEditor extends StatefulWidget {
  final ApiClient api;
  final String companyId;
  final int mes, anio;
  final List<dynamic> schemas, vouchers;
  final Map<String, dynamic>? record;
  const _OperationEditor(
      {required this.api,
      required this.companyId,
      required this.mes,
      required this.anio,
      required this.schemas,
      required this.vouchers,
      this.record});
  @override
  State<_OperationEditor> createState() => _OperationEditorState();
}

class _OperationEditorState extends State<_OperationEditor> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _reference;
  late Map<String, dynamic> _data;
  String? _kind, _voucher, _error;
  bool _saving = false;
  int _revision = 0;
  @override
  void initState() {
    super.initState();
    _kind = widget.record?['kind'];
    _voucher = widget.record?['voucherId'];
    _reference = TextEditingController(text: widget.record?['reference'] ?? '');
    _data = jsonDecode(jsonEncode(widget.record?['data'] ?? {}))
        as Map<String, dynamic>;
  }

  @override
  void dispose() {
    _reference.dispose();
    super.dispose();
  }

  String _label(String name) =>
      const <String, String>{
        'codSustento': 'Código de sustento',
        'tpIdProv': 'Tipo de identificación del proveedor',
        'idProv': 'Identificación del proveedor',
        'tipoComprobante': 'Tipo de comprobante',
        'parteRel': 'Partes relacionadas',
        'fechaRegistro': 'Fecha de registro contable',
        'puntoEmision': 'Punto de emisión',
        'fechaEmision': 'Fecha de emisión',
        'autorizacion': 'Autorización',
        'baseNoGraIva': 'Base no objeto de IVA',
        'baseImponible': 'Base IVA 0 %',
        'baseImpGrav': 'Base gravada con IVA',
        'baseImpExe': 'Base exenta de IVA',
        'montoIce': 'Monto ICE',
        'montoIva': 'Monto IVA',
        'totbasesImpReemb': 'Total de bases del reembolso',
        'pagoExterior': 'Pago local o al exterior',
        'formasDePago': 'Formas de pago',
        'air': 'Retenciones de renta',
        'detalleAir': 'Detalle de retención',
        'reembolsos': 'Comprobantes de reembolso',
        'reembolso': 'Comprobante de sustento',
        'exportacionDe':
            'Tipo de exportación (01 bienes con refrendo, 02 sin refrendo, 03 servicios)',
        'fechaEmbarque': 'Fecha de embarque o registro del ingreso',
        'secuencialInicio': 'Secuencial inicial',
        'secuencialFin': 'Secuencial final',
      }[name] ??
      name.replaceAllMapped(
          RegExp(r'([a-z])([A-Z])'), (m) => '${m[1]} ${m[2]}');

  Widget _scalar(
      Map f, dynamic value, ValueChanged<String?> changed, String path,
      {bool? required}) {
    final name = f['name'] as String,
        mandatory = required ?? f['required'] == true;
    final decoration = InputDecoration(
        labelText: '${_label(name)}${mandatory ? ' *' : ''}',
        helperText: name.toLowerCase().contains('fecha')
            ? 'DD/MM/AAAA'
            : 'Campo ATS: $name',
        helperMaxLines: 2);
    if (f['choices'] != null) {
      return Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: DropdownButtonFormField<String>(
            key: ValueKey('$_revision/$path'),
            initialValue: value as String?,
            isExpanded: true,
            decoration: decoration,
            items: [
              const DropdownMenuItem<String>(
                  value: null, child: Text('Seleccionar')),
              for (final c in f['choices'])
                DropdownMenuItem(value: c as String, child: Text(c))
            ],
            onChanged: changed,
            validator: (v) => mandatory && (v == null || v.isEmpty)
                ? 'Campo obligatorio'
                : null,
          ));
    }
    return Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: TextFormField(
          key: ValueKey('$_revision/$path'),
          initialValue: value?.toString() ?? '',
          decoration: decoration,
          maxLength: 1000,
          onChanged: changed,
          validator: (v) => mandatory && (v?.trim().isEmpty ?? true)
              ? 'Campo obligatorio'
              : null,
        ));
  }

  List<Widget> _fields(
          List<dynamic> fields, Map<String, dynamic> data, String path) =>
      fields.map<Widget>((raw) {
        final f = raw as Map, name = f['name'] as String;
        final children = f['children'] as List?;
        if (f['repeated'] == true) {
          final values = data.putIfAbsent(name, () => <dynamic>[]) as List;
          return Card(
              child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(_label(name),
                            style: Theme.of(context).textTheme.titleMedium),
                        for (var i = 0; i < values.length; i++) ...[
                          Row(children: [
                            Expanded(child: Text('Registro ${i + 1}')),
                            IconButton(
                                tooltip: 'Quitar registro',
                                onPressed: () => setState(() {
                                      values.removeAt(i);
                                      _revision++;
                                    }),
                                icon: const Icon(Icons.remove_circle_outline))
                          ]),
                          if (children != null)
                            ..._fields(
                                children,
                                values[i] as Map<String, dynamic>,
                                '$path/$name/$i')
                          else
                            _scalar(f, values[i], (v) => values[i] = v,
                                '$path/$name/$i',
                                required: true),
                        ],
                        if (values.length < 100)
                          TextButton.icon(
                              onPressed: () => setState(() => values.add(
                                  children == null ? '' : <String, dynamic>{})),
                              icon: const Icon(Icons.add),
                              label: Text('Agregar ${_label(name)}')),
                      ])));
        }
        if (children != null) {
          if (f['required'] == true)
            data.putIfAbsent(name, () => <String, dynamic>{});
          final present = data[name] != null;
          return Card(
              child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (f['required'] != true)
                          SwitchListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text(_label(name)),
                              subtitle: const Text(
                                  'Activar cuando corresponda a la operación'),
                              value: present,
                              onChanged: (v) => setState(() {
                                    if (v) {
                                      data[name] = <String, dynamic>{};
                                    } else {
                                      data.remove(name);
                                    }
                                    _revision++;
                                  }))
                        else
                          Text(_label(name),
                              style: Theme.of(context).textTheme.titleMedium),
                        if (present)
                          ..._fields(
                              children,
                              data[name] as Map<String, dynamic>,
                              '$path/$name'),
                      ])));
        }
        return _scalar(f, data[name], (v) {
          if (v == null || v.trim().isEmpty) {
            data.remove(name);
          } else {
            data[name] = v.trim();
          }
        }, '$path/$name');
      }).toList();

  dynamic _clean(dynamic value) {
    if (value is Map)
      return {
        for (final entry in value.entries)
          if (entry.value != null &&
              entry.value != '' &&
              !(entry.value is List && (entry.value as List).isEmpty))
            entry.key: _clean(entry.value)
      };
    if (value is List) return value.map(_clean).toList();
    return value;
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate() || _kind == null) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.api.post('/api/ats/operations', body: {
        'companyId': widget.companyId,
        'mes': widget.mes,
        'anio': widget.anio,
        'kind': _kind,
        'reference': _reference.text.trim(),
        'data': _clean(_data),
        if (_voucher != null) 'voucherId': _voucher,
        if (widget.record != null) 'id': widget.record!['id'],
        if (widget.record != null) 'version': widget.record!['version'],
      });
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted)
        setState(() => _error =
            e is ApiException ? e.mensaje : 'No se pudo guardar la operación.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final schema = _kind == null
        ? null
        : widget.schemas.firstWhere((s) => s['kind'] == _kind) as Map;
    final direction = schema?['section'] == 'compras'
        ? 'COMPRA'
        : _kind == 'EXPORTACION'
            ? 'VENTA'
            : null;
    return Scaffold(
        appBar: AppBar(title: const Text('Datos de la operación ATS')),
        body: Center(
            child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 760),
                child: AbsorbPointer(
                    absorbing: _saving,
                    child: Form(
                        key: _form,
                        child: ListView(
                            padding: const EdgeInsets.all(16),
                            children: [
                              const Text(
                                  'Completa los campos según el documento y el catálogo ATS. Los importes usan punto decimal. No reemplaces una declaración aduanera por un comprobante 15.'),
                              DropdownButtonFormField<String>(
                                  initialValue: _kind,
                                  isExpanded: true,
                                  decoration: const InputDecoration(
                                      labelText: 'Tipo de operación'),
                                  items: [
                                    for (final s in widget.schemas)
                                      DropdownMenuItem(
                                          value: s['kind'] as String,
                                          child: Text(s['label'] as String,
                                              maxLines: 2,
                                              overflow: TextOverflow.ellipsis))
                                  ],
                                  onChanged: widget.record != null
                                      ? null
                                      : (v) => setState(() {
                                            _kind = v;
                                            _data = {};
                                            _voucher = null;
                                            _revision++;
                                          }),
                                  validator: (v) =>
                                      v == null ? 'Selecciona el tipo' : null),
                              TextFormField(
                                  controller: _reference,
                                  decoration: const InputDecoration(
                                      labelText:
                                          'Descripción y sustento de la operación'),
                                  maxLength: 1000,
                                  validator: (v) => (v?.trim().length ?? 0) < 10
                                      ? 'Describe el sustento (mínimo 10 caracteres)'
                                      : null),
                              if (direction != null)
                                DropdownButtonFormField<String>(
                                    key: ValueKey('voucher/$_kind'),
                                    initialValue: _voucher,
                                    isExpanded: true,
                                    decoration: const InputDecoration(
                                        labelText:
                                            'Comprobante importado relacionado',
                                        helperText:
                                            'Al vincularlo, se reemplaza su detalle ordinario en el ATS.',
                                        helperMaxLines: 3),
                                    items: [
                                      const DropdownMenuItem<String>(
                                          value: null,
                                          child: Text(
                                              'Sin comprobante importado')),
                                      for (final v in widget.vouchers.where(
                                          (v) => v['direccion'] == direction))
                                        DropdownMenuItem(
                                            value: v['id'] as String,
                                            child: Text(
                                                '${v['tipoComprobante']} · ${v['claveAcceso']}',
                                                overflow:
                                                    TextOverflow.ellipsis))
                                    ],
                                    onChanged: (v) => _voucher = v),
                              if (schema != null)
                                ..._fields(
                                    schema['fields'] as List, _data, _kind!),
                              if (_error != null)
                                Padding(
                                    padding: const EdgeInsets.all(12),
                                    child: Text(_error!,
                                        style: TextStyle(
                                            color: Theme.of(context)
                                                .colorScheme
                                                .error))),
                              const SizedBox(height: 16),
                              FilledButton(
                                  onPressed: _saving ? null : _save,
                                  child: Text(_saving
                                      ? 'Validando y guardando…'
                                      : 'Validar y guardar')),
                            ]))))));
  }
}
