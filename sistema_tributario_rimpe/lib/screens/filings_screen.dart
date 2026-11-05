import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:share_plus/share_plus.dart';
import '../services/api_client.dart';
import '../services/api_exception.dart';

class FilingsScreen extends StatefulWidget {
  final ApiClient api;
  final String companyId, declarationId;
  final int revision;
  final bool annual;
  const FilingsScreen({super.key, required this.api, required this.companyId, required this.declarationId, required this.revision, required this.annual});
  @override
  State<FilingsScreen> createState() => _FilingsScreenState();
}
class _FilingsScreenState extends State<FilingsScreen> {
  final form = GlobalKey<FormState>();
  final numero = TextEditingController(), fecha = TextEditingController(), valor = TextEditingController(), nota = TextEditingController();
  String tipo = 'PRESENTACION', formulario = '104';
  String? pdf, error, filename;
  bool busy = false;
  List<dynamic> records = [];
  @override
  void initState() { super.initState(); formulario = widget.annual ? 'RENTA' : '104'; load(); }
  @override
  void dispose() { for (final c in [numero, fecha, valor, nota]) { c.dispose(); } super.dispose(); }
  Future<void> load() async {
    try {
      final data = await widget.api.get('/api/declarations/filings', query: {'companyId': widget.companyId, 'declarationId': widget.declarationId});
      if (mounted) setState(() => records = data as List);
    } on ApiException catch (e) { if (mounted) setState(() => error = e.mensaje); }
  }
  Future<void> attach() async {
    final result = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: ['pdf'], withData: true);
    if (result == null || !mounted) return;
    final file = result.files.single;
    if (file.size > 1024 * 1024 || file.bytes == null) { setState(() => error = 'Selecciona un PDF de hasta 1 MB.'); return; }
    setState(() { pdf = base64Encode(file.bytes!); filename = file.name; error = null; });
  }
  Future<void> save() async {
    if (!form.currentState!.validate()) return;
    setState(() { busy = true; error = null; });
    try {
      await widget.api.post('/api/declarations/filings', body: {
        'companyId': widget.companyId, 'declarationId': widget.declarationId, 'revision': widget.revision,
        'tipo': tipo, 'formulario': formulario, 'numero': numero.text.trim(), 'fecha': fecha.text,
        'valor': valor.text.trim().replaceAll(',', '.'), 'observacion': nota.text.trim(),
        if (pdf != null) 'archivoBase64': pdf,
      });
      if (!mounted) return;
      numero.clear(); valor.clear(); nota.clear(); setState(() { pdf = null; filename = null; });
      await load();
    } on ApiException catch (e) { if (mounted) setState(() => error = e.mensaje); }
    finally { if (mounted) setState(() => busy = false); }
  }
  Future<void> download(String id) async {
    try {
      final data = await widget.api.get('/api/declarations/filing-file', query: {'companyId': widget.companyId, 'id': id});
      await Share.shareXFiles([XFile.fromData(base64Decode(data['archivoBase64']), name: data['nombre'], mimeType: 'application/pdf')]);
    } on ApiException catch (e) { if (mounted) setState(() => error = e.mensaje); }
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Presentaciones y pagos')),
    body: Form(key: form, child: ListView(padding: const EdgeInsets.all(20), children: [
      Text('Versión ${widget.revision}. Registra lo realizado en SRI en Línea. El sistema conserva el respaldo; no confirma su aceptación ante el SRI.'),
      const SizedBox(height: 16),
      DropdownButtonFormField<String>(initialValue: formulario, decoration: const InputDecoration(labelText: 'Formulario'),
        items: (widget.annual ? ['RENTA'] : ['103','104']).map((v) => DropdownMenuItem(value: v, child: Text(v))).toList(),
        onChanged: busy ? null : (v) => setState(() => formulario = v!)),
      DropdownButtonFormField<String>(initialValue: tipo, decoration: const InputDecoration(labelText: 'Registro'),
        items: const [DropdownMenuItem(value: 'PRESENTACION', child: Text('Presentación')), DropdownMenuItem(value: 'PAGO', child: Text('Pago'))],
        onChanged: busy ? null : (v) => setState(() => tipo = v!)),
      TextFormField(controller: numero, decoration: const InputDecoration(labelText: 'Número de declaración o comprobante'), validator: (v) => (v ?? '').trim().isEmpty ? 'Campo requerido' : null),
      TextFormField(controller: fecha, readOnly: true, decoration: const InputDecoration(labelText: 'Fecha'),
        onTap: busy ? null : () async {
          final day = await showDatePicker(context: context, firstDate: DateTime(2000), lastDate: DateTime.now(), initialDate: DateTime.now());
          if (day != null) fecha.text = '${day.year}-${day.month.toString().padLeft(2,'0')}-${day.day.toString().padLeft(2,'0')}';
        }, validator: (v) => (v ?? '').isEmpty ? 'Selecciona la fecha' : null),
      TextFormField(controller: valor, decoration: const InputDecoration(labelText: 'Valor declarado o pagado'),
        keyboardType: const TextInputType.numberWithOptions(decimal: true), validator: (v) => RegExp(r'^\d{1,9}([.,]\d{1,2})?$').hasMatch(v ?? '') ? null : 'Importe inválido'),
      TextFormField(controller: nota, decoration: const InputDecoration(labelText: 'Observación'), validator: (v) => (v ?? '').trim().length < 5 ? 'Describe el respaldo' : null),
      OutlinedButton.icon(onPressed: busy ? null : attach, icon: const Icon(Icons.attach_file), label: Text(filename ?? 'Adjuntar PDF (hasta 1 MB)')),
      if (error != null) Text(error!, style: const TextStyle(color: Colors.red)),
      FilledButton(onPressed: busy ? null : save, child: Text(busy ? 'Guardando…' : 'Registrar respaldo')),
      const Divider(),
      if (records.isEmpty) const Text('Todavía no hay presentaciones ni pagos registrados.'),
      ...records.map((r) => Card(child: ListTile(
        title: Text('${r['formulario']} · ${r['tipo']} · ${r['numero']}'),
        subtitle: Text('Versión ${r['revision']} · ${r['fecha'].toString().split('T').first}\n\$${r['valor']} · ${r['observacion']}'),
        trailing: r['hashArchivo'] == null ? null : IconButton(icon: const Icon(Icons.download), onPressed: () => download(r['id'])),
      ))),
    ])),
  );
}
