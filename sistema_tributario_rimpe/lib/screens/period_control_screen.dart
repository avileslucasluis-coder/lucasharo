import 'package:flutter/material.dart';
import '../services/declaration_api_service.dart';
import '../services/api_exception.dart';

class PeriodControlScreen extends StatefulWidget {
  final DeclarationApiService service;
  final String companyId, periodicidad;
  final int mes, anio;
  const PeriodControlScreen({super.key, required this.service, required this.companyId, required this.periodicidad, required this.mes, required this.anio});
  @override
  State<PeriodControlScreen> createState() => _PeriodControlScreenState();
}

class _PeriodControlScreenState extends State<PeriodControlScreen> {
  Map<String, dynamic>? _last;
  bool _busy = true;
  String? _error;
  String _search = '';
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    try {
      final history = await widget.service.historial(companyId: widget.companyId, mes: widget.mes, anio: widget.anio, periodicidad: widget.periodicidad);
      if (mounted) setState(() { _last = history.isEmpty ? null : history.last; _busy = false; });
    } on ApiException catch (e) { if (mounted) setState(() { _error = e.mensaje; _busy = false; }); }
  }
  Future<void> _change(String action) async {
    var reason = '';
    final form = GlobalKey<FormState>();
    final accepted = await showDialog<bool>(context: context, builder: (context) => AlertDialog(
      title: Text({'REVISAR':'Enviar a revisión','APROBAR':'Aprobar revisión','CERRAR':'Cerrar período','REABRIR':'Reabrir período'}[action]!),
      content: SingleChildScrollView(child: Form(key: form, child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(action == 'CERRAR' ? 'Se bloquearán los cálculos, las importaciones y las operaciones de este período. Este cierre es interno y no envía información al SRI.' : 'La acción y su justificación quedarán en el historial. No constituye validación del SRI.'),
        const SizedBox(height: 12),
        TextFormField(maxLines: 3, maxLength: 1000, decoration: const InputDecoration(labelText: 'Justificación de la revisión o cambio'),
          onChanged: (v) => reason = v.trim(), validator: (_) => reason.length < 10 ? 'Escribe al menos 10 caracteres.' : null),
      ]))), actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
        FilledButton(onPressed: () { if (form.currentState!.validate()) Navigator.pop(context, true); }, child: const Text('Confirmar'))],
    ));
    if (!mounted || accepted != true) return;
    setState(() { _busy = true; _error = null; });
    try {
      await widget.service.api.post('/api/declarations/workflow', body: {'companyId': widget.companyId, 'mes': widget.mes, 'anio': widget.anio,
        'periodicidad': widget.periodicidad, 'accion': action, 'revision': _last!['version'], 'motivo': reason});
      await _load();
    } on ApiException catch (e) { if (mounted) setState(() { _error = e.mensaje; _busy = false; }); }
  }
  @override
  Widget build(BuildContext context) {
    final snapshot = _last?['snapshot'] as Map? ?? {};
    final status = snapshot['estado'] ?? 'SIN GENERAR';
    final liquidation = snapshot['liquidacion'] as Map? ?? {};
    final detail = liquidation['detalleComprobantes'] as List?;
    final next = {'BORRADOR':'REVISAR','PRESENTADA_LOCAL':'REVISAR','EN_REVISION':'APROBAR','APROBADA':'CERRAR'}[status];
    return Scaffold(appBar: AppBar(title: const Text('Revisión y cierre del período')), body: _busy ? const Center(child: CircularProgressIndicator()) : ListView(padding: const EdgeInsets.all(20), children: [
      Text('${widget.mes}/${widget.anio} · ${widget.periodicidad} · $status', style: Theme.of(context).textTheme.titleMedium),
      if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
      if (_last == null) const Text('Genera primero el papel de trabajo y confirma su conciliación.'),
      if (_last != null) ...[
        Text('Versión ${_last!['version']}. La aprobación es una revisión interna del usuario autorizado; no certifica aceptación del SRI.'),
        if (liquidation['controlPeriodo'] is Map) Text('Última acción: ${liquidation['controlPeriodo']['accion']}\n${liquidation['controlPeriodo']['motivo']}'),
        Wrap(spacing: 12, children: [
          if (next != null) FilledButton(onPressed: () => _change(next), child: Text({'REVISAR':'Enviar a revisión','APROBAR':'Aprobar','CERRAR':'Cerrar período'}[next]!)),
          if (['EN_REVISION','APROBADA','CERRADA'].contains(status)) OutlinedButton(onPressed: () => _change('REABRIR'), child: const Text('Reabrir con justificación')),
        ]),
        const SizedBox(height: 20),
        const Text('Detalle de comprobantes de la versión guardada', style: TextStyle(fontWeight: FontWeight.bold)),
        const Text('Las notas de crédito restan. El IVA sin derecho a crédito y las operaciones especiales se revisan por separado en la conciliación y en ATS.'),
        if (detail == null) const Text('Esta versión antigua no conserva el detalle. Para obtenerlo, genera una nueva versión después de reabrir si corresponde.'),
        if (detail != null) ...[
          TextField(decoration: const InputDecoration(labelText: 'Buscar clave, emisor o tipo'), onChanged: (v) => setState(() => _search = v.toLowerCase())),
          Text('${detail.length} comprobantes'),
          ...detail.where((v) => '${v['clave']} ${v['emisor']} ${v['nombre']} ${v['tipo']} ${v['direccion']}'.toLowerCase().contains(_search)).map((v) => Card(child: ExpansionTile(
            title: Text('${v['tipo']} · ${v['direccion']} · ${v['fecha']}'), subtitle: Text('${v['nombre']} · IVA: ${v['iva']} · signo: ${v['signo']}'),
            children: [ListTile(title: SelectableText('${v['clave']}'), subtitle: Text('Emisor: ${v['emisor']}\nBase gravada: ${v['baseGravada']}\nBase cero: ${v['baseCero']}\nRenta retenida: ${v['renta']}'))],
          ))),
        ],
      ],
    ]));
  }
}
