import 'package:flutter/material.dart';
import '../services/declaration_api_service.dart';
import '../services/api_exception.dart';

class SourceReconciliationScreen extends StatefulWidget {
  final DeclarationApiService service;
  final String companyId;
  final int mes, anio;
  const SourceReconciliationScreen({super.key, required this.service, required this.companyId, required this.mes, required this.anio});
  @override
  State<SourceReconciliationScreen> createState() => _SourceReconciliationScreenState();
}

class _SourceReconciliationScreenState extends State<SourceReconciliationScreen> {
  Map? _data;
  String? _error;
  bool _busy = false;
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    setState(() { _busy = true; _error = null; });
    try {
      final data = await widget.service.api.get('/api/declarations/sources', query: {
        'companyId': widget.companyId, 'mes': '${widget.mes}', 'anio': '${widget.anio}',
      }) as Map;
      if (mounted) setState(() => _data = data);
    } on ApiException catch (e) { if (mounted) setState(() => _error = e.mensaje); }
    catch (_) { if (mounted) setState(() => _error = 'No se pudieron cargar las fuentes. Intenta nuevamente.'); }
    finally { if (mounted) setState(() => _busy = false); }
  }
  Future<void> _decide(Map document) async {
    setState(() { _busy = true; _error = null; });
    try {
      final record = await widget.service.api.get('/api/declarations/period-decisions', query: {
        'companyId': widget.companyId, 'voucherId': '${document['id']}',
      }) as Map;
      if (!mounted) return;
      setState(() => _busy = false);
      final history = record['history'] as List;
      final current = record['document'] as Map;
      var choice = 'PENDIENTE', reason = '', evidence = '';
      final form = GlobalKey<FormState>();
      final accepted = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
        title: const Text('Decisión de período'),
        content: SizedBox(width: 520, child: SingleChildScrollView(child: Form(key: form, child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Emisión: ${current['emissionPeriod']} · ATS: ${current['atsPeriod']}'),
          const Text('Registra una propuesta respaldada. En esta etapa no modifica el período usado por la liquidación ni las fechas originales.'),
          if (record['stale'] == true) const Text('La fuente cambió desde la última decisión. Revisa nuevamente.', style: TextStyle(color: Colors.red)),
          DropdownButtonFormField<String>(initialValue: choice, isExpanded: true, decoration: const InputDecoration(labelText: 'Propuesta para IVA'), items: const [
            DropdownMenuItem(value: 'PENDIENTE', child: Text('Pendiente de validación')),
            DropdownMenuItem(value: 'EMISION', child: Text('Período de emisión')),
            DropdownMenuItem(value: 'REGISTRO', child: Text('Período de registro contable')),
          ], onChanged: (v) => choice = v!),
          TextFormField(maxLength: 1000, maxLines: 3, decoration: const InputDecoration(labelText: 'Justificación'), onChanged: (v) => reason = v.trim(), validator: (_) => reason.length < 10 ? 'Escribe al menos 10 caracteres.' : null),
          TextFormField(maxLength: 500, decoration: const InputDecoration(labelText: 'Referencia del respaldo documental'), onChanged: (v) => evidence = v.trim(), validator: (_) => evidence.length < 5 ? 'Indica el documento de respaldo.' : null),
          const Text('Historial de propuestas', style: TextStyle(fontWeight: FontWeight.bold)),
          if (history.isEmpty) const Text('Sin decisiones registradas.'),
          for (final h in history) Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Text(
            'Versión ${h['version']} · ${h['proposedPeriod'] ?? 'Pendiente'}\n${h['actor']?['nombre'] ?? h['actorId']} · ${h['createdAt']}\n${h['justification']}\nRespaldo: ${h['evidence']}')),
        ])))),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () { if (form.currentState!.validate()) Navigator.pop(ctx, true); }, child: const Text('Guardar propuesta'))],
      ));
      if (!mounted || accepted != true) return;
      setState(() => _busy = true);
      await widget.service.api.post('/api/declarations/period-decisions', body: {
        'companyId': widget.companyId, 'voucherId': document['id'], 'previousVersion': history.isEmpty ? 0 : history.last['version'],
        'sourceHash': record['sourceHash'], 'choice': choice, 'justification': reason, 'evidence': evidence,
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Propuesta guardada con historial. La liquidación no cambió.')));
    } on ApiException catch (e) { if (mounted) setState(() => _error = e.mensaje); }
    catch (_) { if (mounted) setState(() => _error = 'No se pudo registrar la decisión. Consulta el historial antes de reintentar.'); }
    finally { if (mounted) setState(() => _busy = false); }
  }
  @override
  Widget build(BuildContext context) {
    final snapshot = _data?['snapshot'] as Map?;
    final documents = snapshot?['documents'] as List? ?? [];
    final operations = snapshot?['complementary'] as List? ?? [];
    return Scaffold(appBar: AppBar(title: const Text('Fuentes y períodos IVA–ATS')), body: _busy ? const Center(child: CircularProgressIndicator()) : ListView(padding: const EdgeInsets.all(20), children: [
      Text('${widget.mes}/${widget.anio}'),
      const Text('Las diferencias surgen porque el papel de trabajo usa emisión y el ATS puede usar registro contable. Las propuestas quedan pendientes de aplicación y revisión tributaria.'),
      if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
      TextButton(onPressed: _load, child: const Text('Actualizar fuentes')),
      if (documents.isEmpty && operations.isEmpty && _data != null) const Text('No hay fuentes en este período.'),
      for (final d in documents) Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${d['tipo']} · ${d['emisor']}'), SelectableText('${d['clave']}'),
        Text('Emisión: ${d['emissionPeriod']} · ATS: ${d['atsPeriod']} · IVA: ${d['iva']}'),
        if (d['emissionPeriod'] != d['atsPeriod']) ...[
          const Text('Diferencia de período: requiere decisión respaldada.'),
          OutlinedButton(onPressed: () => _decide(d as Map), child: const Text('Decidir y ver historial')),
        ],
      ]))),
      for (final o in operations) Card(child: ListTile(title: Text('${o['kind']} · ${o['reference']}'), subtitle: Text(
        '${o['voucherId'] == null ? 'Operación independiente' : 'Complemento de un comprobante XML'}\nTratamiento tributario pendiente. No se suma automáticamente al IVA.'))),
    ]));
  }
}
