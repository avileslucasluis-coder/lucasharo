import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import '../models/company.dart';
import '../services/api_exception.dart';
import '../services/company_service.dart';
import '../services/voucher_service.dart';

class ExcelExportScreen extends StatefulWidget {
  final CompanyService companies;
  final VoucherService vouchers;
  const ExcelExportScreen({super.key, required this.companies, required this.vouchers});
  @override
  State<ExcelExportScreen> createState() => _ExcelExportScreenState();
}

class _ExcelExportScreenState extends State<ExcelExportScreen> {
  List<Company> companies = [];
  String? companyId, error, result;
  bool loading = true, downloading = false, annual = false;
  int year = DateTime.now().year, month = DateTime.now().month;
  @override
  void initState() { super.initState(); load(); }
  Future<void> load() async {
    setState(() { loading = true; error = null; });
    try {
      final list = await widget.companies.listar();
      if (mounted) setState(() { companies = list; companyId = list.isEmpty ? null : list.first.id; });
    } catch (e) {
      if (mounted) setState(() => error = e is ApiException ? e.mensaje : 'No se pudieron cargar las empresas.');
    } finally { if (mounted) setState(() => loading = false); }
  }
  Future<void> download() async {
    if (companyId == null || downloading) return;
    setState(() { downloading = true; error = null; result = null; });
    try {
      final file = await widget.vouchers.exportarExcel(companyId: companyId!, anio: year, mes: annual ? null : month);
      if (!mounted) return;
      final filename = file['filename'] as String;
      await Share.shareXFiles([XFile.fromData(base64Decode(file['contentBase64']), name: filename, mimeType: file['mimeType'])], fileNameOverrides: [filename], subject: 'Consolidado de ventas, compras y retenciones');
      if (mounted) setState(() => result = 'Excel preparado: ${file['comprobantes']} comprobantes · ${file['pendientes']} pendientes de clasificación.');
    } catch (e) {
      if (mounted) setState(() => error = e is ApiException ? e.mensaje : 'No se pudo preparar el Excel. Intenta nuevamente.');
    } finally { if (mounted) setState(() => downloading = false); }
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Exportar Excel')),
    body: ListView(padding: const EdgeInsets.all(24), children: [
      Text('Tus movimientos en un solo Excel', style: Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height: 8),
      const Text('Consolidado mensual o anual por empresa, con ventas, compras y retenciones recibidas y emitidas.'),
      const SizedBox(height: 24),
      if (loading) const LinearProgressIndicator(),
      if (!loading && companies.isEmpty) const Text('Agrega una empresa para exportar sus movimientos.'),
      if (companies.isNotEmpty) Card(child: Padding(padding: const EdgeInsets.all(20), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        DropdownButtonFormField<String>(value: companyId, isExpanded: true, decoration: const InputDecoration(labelText: 'Empresa'),
          items: companies.map((c) => DropdownMenuItem(value: c.id, child: Text('${c.razonSocial} (${c.ruc})'))).toList(),
          onChanged: downloading ? null : (v) => setState(() { companyId = v; result = null; })),
        const SizedBox(height: 16),
        Wrap(spacing: 12, children: [
          ChoiceChip(label: const Text('Mensual'), selected: !annual, onSelected: downloading ? null : (_) => setState(() { annual = false; result = null; })),
          ChoiceChip(label: const Text('Anual'), selected: annual, onSelected: downloading ? null : (_) => setState(() { annual = true; result = null; })),
        ]),
        const SizedBox(height: 16),
        Wrap(spacing: 16, runSpacing: 16, children: [
          SizedBox(width: 150, child: DropdownButtonFormField<int>(value: year, decoration: const InputDecoration(labelText: 'Año'),
            items: List.generate(101, (i) => DropdownMenuItem(value: 2000 + i, child: Text('${2000 + i}'))), onChanged: downloading ? null : (v) => setState(() { year = v!; result = null; }))),
          if (!annual) SizedBox(width: 150, child: DropdownButtonFormField<int>(value: month, decoration: const InputDecoration(labelText: 'Mes'),
            items: List.generate(12, (i) => DropdownMenuItem(value: i + 1, child: Text('${i + 1}'))), onChanged: downloading ? null : (v) => setState(() { month = v!; result = null; }))),
        ]),
        const SizedBox(height: 24),
        FilledButton.icon(onPressed: downloading ? null : download, icon: const Icon(Icons.download), label: Text(downloading ? 'Preparando Excel…' : 'Descargar Excel (.xlsx)')),
      ]))),
      const SizedBox(height: 16),
      const Text('Incluye', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
      const ListTile(leading: Icon(Icons.summarize_outlined), title: Text('Resumen y desglose por tarifa'), subtitle: Text('El anual incluye los 12 meses y el total del año. Bases, IVA y retenciones separados, con importes numéricos en dólares.')),
      const ListTile(leading: Icon(Icons.receipt_long_outlined), title: Text('Comprobantes y detalle de impuestos'), subtitle: Text('Permite rastrear cada importe hasta su factura. Si una factura tiene varias tarifas, cada una conserva su base e IVA.')),
      const ListTile(leading: Icon(Icons.info_outline), title: Text('Pendientes identificados'), subtitle: Text('Los pendientes aparecen en el archivo y no se suman al total clasificado. Las notas de crédito restan.')),
      if (result != null) Text(result!, style: const TextStyle(fontWeight: FontWeight.bold)),
      if (error != null) ListTile(title: Text(error!), trailing: loading ? null : TextButton(onPressed: companies.isEmpty ? load : download, child: const Text('Reintentar'))),
    ]),
  );
}
