import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../services/api_exception.dart';

class AtsReviewScreen extends StatefulWidget {
  final ApiClient api;
  final String companyId;
  final int mes, anio;
  const AtsReviewScreen({super.key, required this.api, required this.companyId, required this.mes, required this.anio});
  @override
  State<AtsReviewScreen> createState() => _AtsReviewScreenState();
}

class _AtsReviewScreenState extends State<AtsReviewScreen> {
  List<dynamic>? _items;
  String? _error;
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    try {
      final data = await widget.api.get('/api/ats/review', query: {'companyId': widget.companyId, 'mes': '${widget.mes}', 'anio': '${widget.anio}'}) as List;
      if (mounted) setState(() { _items = data.where((v) => ['COMPRA', 'VENTA'].contains(v['direccion'])).toList(); _error = null; });
    } catch (e) { if (mounted) setState(() => _error = e is ApiException ? e.mensaje : 'No se pudo consultar el período.'); }
  }
  Future<void> _edit(Map<String, dynamic> item) async {
    final rev = Map<String, dynamic>.from(item['atsRevision'] ?? {});
    final sustento = TextEditingController(text: rev['codSustento'] ?? '');
    final fechaRegistro = TextEditingController(text: (item['fechaRegistroAts'] ?? item['fechaEmision']).toString().substring(0,10));
    final pagos = TextEditingController(text: (rev['pagos'] as List? ?? []).join(','));
    final autorizacion = TextEditingController(text: rev['autorizacionModificado'] ?? '');
    final nota = TextEditingController(text: rev['observacion'] ?? '');
    bool local = rev['operacionLocal'] == true;
    String? relacionada = rev['parteRelacionada'];
    final form = GlobalKey<FormState>();
    final guardar = await showDialog<bool>(context: context, builder: (context) => StatefulBuilder(builder: (context, update) => AlertDialog(
      title: const Text('Revisión tributaria del comprobante'),
      content: SizedBox(width: 460, child: SingleChildScrollView(child: Form(key: form, child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Text('Confirma estos datos con el comprobante y su tratamiento tributario. Para exportaciones y reembolsos utiliza Operaciones especiales y vincula el comprobante.'),
        CheckboxListTile(contentPadding: EdgeInsets.zero, title: const Text('Es una operación local sin tratamiento especial'), value: local, onChanged: (v) => update(() => local = v ?? false)),
        DropdownButtonFormField<String>(initialValue: relacionada, decoration: const InputDecoration(labelText: '¿Existe relación entre las partes?'), items: const [DropdownMenuItem(value: 'SI', child: Text('Sí')), DropdownMenuItem(value: 'NO', child: Text('No'))], onChanged: (v) => relacionada = v, validator: (v) => v == null ? 'Selecciona una opción' : null),
        if (item['direccion'] == 'COMPRA') TextFormField(controller: sustento, decoration: const InputDecoration(labelText: 'Código de sustento tributario (2 dígitos)'), validator: (v) => RegExp(r'^\d{2}$').hasMatch(v ?? '') ? null : 'Ingresa el código aplicable'),
        if (item['direccion'] == 'COMPRA') TextFormField(controller: fechaRegistro, decoration: const InputDecoration(labelText: 'Fecha de registro contable AAAA-MM-DD', helperText: 'Determina el período ATS. No modifica la fecha de emisión.'), validator: (v) => RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(v ?? '') ? null : 'Revisa la fecha contable'),
        TextFormField(controller: pagos, decoration: const InputDecoration(labelText: 'Formas de pago, separadas por coma', helperText: 'Vacío conserva las formas del XML.'), validator: (v) => (v ?? '').isEmpty || v!.split(',').every((p) => RegExp(r'^\d{2}$').hasMatch(p.trim())) ? null : 'Usa códigos de dos dígitos'),
        if (item['direccion'] == 'COMPRA' && item['tipoComprobante'] == 'NOTA_CREDITO') TextFormField(controller: autorizacion, decoration: const InputDecoration(labelText: 'Autorización del documento modificado'), validator: (v) => RegExp(r'^\d{3,49}$').hasMatch(v ?? '') ? null : 'Ingresa la autorización'),
        TextFormField(controller: nota, maxLength: 500, decoration: const InputDecoration(labelText: 'Fundamento de la revisión'), validator: (v) => (v?.trim().length ?? 0) >= 5 ? null : 'Describe la revisión realizada'),
      ])))),
      actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')), FilledButton(onPressed: () { if (form.currentState!.validate()) Navigator.pop(context, true); }, child: const Text('Guardar'))],
    )));
    if (guardar == true) {
      try {
        await widget.api.post('/api/ats/review', body: {'companyId': widget.companyId, 'voucherId': item['id'], if (item['direccion'] == 'COMPRA') 'fechaRegistro': fechaRegistro.text, 'operacionLocal': local, 'parteRelacionada': relacionada, 'pagos': pagos.text.split(',').map((p) => p.trim()).where((p) => p.isNotEmpty).toSet().toList(), 'observacion': nota.text.trim(), if (sustento.text.isNotEmpty) 'codSustento': sustento.text, if (autorizacion.text.isNotEmpty) 'autorizacionModificado': autorizacion.text});
        await _load();
      } catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.mensaje : 'No se pudo guardar la revisión.'))); }
    }
    for (final controller in [sustento, pagos, autorizacion, nota, fechaRegistro]) { controller.dispose(); }
  }
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text('Revisión ATS ${widget.mes}/${widget.anio}')), body: _error != null ? Center(child: Text(_error!)) : _items == null ? const Center(child: CircularProgressIndicator()) : _items!.isEmpty ? const Center(child: Text('No hay compras ni ventas en este período.')) : ListView.builder(itemCount: _items!.length, itemBuilder: (context, i) {
    final v = Map<String, dynamic>.from(_items![i]);
    return ListTile(title: Text('${v['direccion']} · ${v['tipoComprobante']}'), subtitle: Text('${v['identificacionContraparte']}\n${v['atsRevision'] == null ? 'Pendiente de revisión' : 'Revisión guardada'}'), trailing: const Icon(Icons.edit_outlined), onTap: () => _edit(v));
  }));
}
