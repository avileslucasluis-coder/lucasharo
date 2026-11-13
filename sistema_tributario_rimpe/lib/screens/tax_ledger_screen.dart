import 'dart:async';
import 'package:flutter/material.dart';
import '../models/company.dart';
import '../models/voucher.dart';
import '../services/company_service.dart';
import '../services/voucher_service.dart';
import '../utils/app_theme.dart';
import 'xml_import_screen.dart';

class TaxBreakdown extends StatelessWidget {
  final List<Map<String, dynamic>> lines;
  const TaxBreakdown({super.key, required this.lines});
  @override
  Widget build(BuildContext context) => SingleChildScrollView(scrollDirection: Axis.horizontal,
    child: DataTable(columns: const [DataColumn(label: Text('Operación')), DataColumn(label: Text('Impuesto')),
      DataColumn(label: Text('Tarifa')), DataColumn(label: Text('Subtotal / base'), numeric: true),
      DataColumn(label: Text('IVA / retenido'), numeric: true)],
      rows: lines.map((l) => DataRow(cells: [DataCell(Text('${l['direccion'] ?? ''}')),
        DataCell(Text('${l['grupo']}')), DataCell(Text(['NO_OBJETO', 'EXENTO', 'OTROS'].contains(l['tarifa']) ? '${l['tarifa']}'.replaceAll('_', ' ') : '${l['tarifa']} %')),
        DataCell(Text(Formatters.currency.format(num.parse('${l['base']}')))),
        DataCell(Text(Formatters.currency.format(num.parse('${l['valor']}'))))])).toList()));
}

class TaxLedgerScreen extends StatefulWidget {
  final CompanyService companies;
  final VoucherService vouchers;
  final bool retenciones;
  const TaxLedgerScreen({super.key, required this.companies, required this.vouchers, this.retenciones = false});
  @override
  State<TaxLedgerScreen> createState() => _TaxLedgerScreenState();
}

class _TaxLedgerScreenState extends State<TaxLedgerScreen> {
  List<Company> companies = [];
  List<Voucher> vouchers = [];
  String? companyId;
  int month = DateTime.now().month, year = DateTime.now().year;
  bool busy = true;
  String? error;
  late String direction = widget.retenciones ? 'RETENCION_RECIBIDA' : 'COMPRA';
  int request = 0;
  bool _sriActivo = false;
  int _sriCompletados = 0;
  void _actualizarSri() {
    if (!mounted || companyId == null) return;
    final estado = widget.vouchers.estadoSri(companyId!);
    if (estado == null) return;
    final termino = _sriActivo && !estado.activo;
    final actualizar = termino || estado.completados - _sriCompletados >= 5;
    _sriActivo = estado.activo;
    if (actualizar) _sriCompletados = estado.completados;
    setState(() {});
    if (actualizar) unawaited(reload());
  }
  @override
  void initState() { super.initState(); widget.vouchers.addListener(_actualizarSri); init(); }
  @override
  void dispose() { widget.vouchers.removeListener(_actualizarSri); super.dispose(); }
  Future<void> init() async {
    try {
      final result = await widget.companies.listar();
      if (!mounted) return;
      setState(() { companies = result; companyId = result.isEmpty ? null : result.first.id; });
      await reload();
    } catch (e) { if (mounted) setState(() { error = '$e'; busy = false; }); }
  }
  Future<void> reload() async {
    final id = ++request;
    setState(() { busy = true; error = null; vouchers = []; });
    try {
      final result = companyId == null ? <Voucher>[] : await widget.vouchers.listar(companyId: companyId!, mes: month, anio: year);
      if (mounted && id == request) {
        setState(() => vouchers = result);
        if (companyId != null) {
          final estado = widget.vouchers.estadoSri(companyId!);
          _sriActivo = estado?.activo ?? false;
          _sriCompletados = estado?.completados ?? 0;
          if (result.any((v) => v.clasificacionPendiente) && estado == null) {
            unawaited(widget.vouchers.completarPendientes(companyId!));
          }
        }
      }
    } catch (e) { if (mounted && id == request) setState(() => error = '$e'); }
    finally { if (mounted && id == request) setState(() => busy = false); }
  }
  @override
  Widget build(BuildContext context) {
    final visible = vouchers.where((v) => v.direccion == direction && (widget.retenciones ? v.tipoComprobante == 'RETENCION' : v.tipoComprobante != 'RETENCION')).toList();
    final groups = <String, Map<String, dynamic>>{};
    for (final group in widget.retenciones ? ['RET_IVA', 'RENTA'] : ['IVA']) {
      for (final rate in group == 'IVA' ? ['15','8','5','0','NO_OBJETO'] : group == 'RET_IVA' ? ['30','70','100','0','10','20','50'] : ['15','10','5','3','2','1','0']) {
        groups['$group:$rate'] = {'grupo': group, 'tarifa': rate, 'base': 0, 'valor': 0};
      }
    }
    for (final v in visible.where((v) => !v.clasificacionPendiente)) {
      final sign = v.tipoComprobante == 'NOTA_CREDITO' ? -1 : 1;
      for (final l in v.detalleImpuestos) {
        final b = groups.putIfAbsent('${l['grupo']}:${l['tarifa']}', () => {'grupo': l['grupo'], 'tarifa': l['tarifa'], 'base': 0, 'valor': 0});
        for (final field in ['base', 'valor']) { b[field] = (b[field] as int) + (num.parse('${l[field]}') * 100).round() * sign; }
      }
    }
    final summary = groups.values.map((b) => {...b, 'base': (b['base'] as int) / 100, 'valor': (b['valor'] as int) / 100}).toList();
    final pending = visible.where((v) => v.clasificacionPendiente).length;
    final estadoSri = companyId == null ? null : widget.vouchers.estadoSri(companyId!);
    final total = visible.where((v) => !v.clasificacionPendiente).fold<int>(0, (s,v) => s + (v.importeTotal * 100).round() * (v.tipoComprobante == 'NOTA_CREDITO' ? -1 : 1));
    return Scaffold(appBar: AppBar(title: Text(widget.retenciones ? 'Retenciones' : 'Facturas')),
      body: ListView(padding: const EdgeInsets.all(24), children: [
        Text(widget.retenciones ? 'IVA y retenciones en la fuente' : 'Facturas por tarifa de IVA', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 16),
        Wrap(spacing: 16, runSpacing: 12, children: [
          SizedBox(width: 320, child: DropdownButtonFormField<String>(value: companyId, isExpanded: true,
            decoration: const InputDecoration(labelText: 'Empresa'), items: companies.map((c) => DropdownMenuItem(value: c.id, child: Text(c.razonSocial))).toList(),
            onChanged: busy ? null : (v) { setState(() => companyId = v); reload(); })),
          SizedBox(width: 140, child: DropdownButtonFormField<int>(value: month, decoration: const InputDecoration(labelText: 'Mes'),
            items: List.generate(12, (i) => DropdownMenuItem(value: i+1, child: Text('${i+1}'))), onChanged: busy ? null : (v) { setState(() => month = v!); reload(); })),
          SizedBox(width: 140, child: DropdownButtonFormField<int>(value: year, decoration: const InputDecoration(labelText: 'Año'),
            items: List.generate(101, (i) => DropdownMenuItem(value: 2000+i, child: Text('${2000+i}'))), onChanged: busy ? null : (v) { setState(() => year = v!); reload(); })),
          FilledButton.icon(icon: const Icon(Icons.upload_file), label: const Text('Cargar XML / TXT'), onPressed: busy ? null : () async {
            await Navigator.push(context, MaterialPageRoute(builder: (_) => XmlImportScreen(companies: widget.companies, vouchers: widget.vouchers)));
            if (mounted) reload();
          }),
        ]),
        const SizedBox(height: 16),
        Wrap(spacing: 8, children: (widget.retenciones ? {'RETENCION_RECIBIDA': 'Recibidas', 'RETENCION_EMITIDA': 'Emitidas'} : {'COMPRA': 'Compras', 'VENTA': 'Ventas'}).entries.map((e) => ChoiceChip(label: Text(e.value), selected: direction == e.key, onSelected: (_) => setState(() => direction = e.key))).toList()),
        if (busy) const LinearProgressIndicator(),
        if (error != null) ListTile(title: Text(error!), trailing: TextButton(onPressed: reload, child: const Text('Reintentar'))),
        if (pending > 0 || estadoSri?.activo == true) Card(color: Colors.amber.shade50, child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(estadoSri?.activo == true ? estadoSri!.mensaje : '$pending comprobantes pendientes de consulta al SRI.'),
          const Text('El desglose incluye solo comprobantes clasificados. La consulta continúa al cambiar de sección; no necesitas descargar XML.'),
          if (estadoSri?.activo == true) const LinearProgressIndicator()
          else ...[
            if (estadoSri?.error != null) Text(estadoSri!.error!),
            if (estadoSri != null && estadoSri.errores.isNotEmpty) Text(estadoSri.errores.values.first),
            TextButton.icon(onPressed: () => widget.vouchers.completarPendientes(companyId!), icon: const Icon(Icons.sync), label: const Text('Reintentar consulta automática')),
          ],
        ]))),
        Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${pending > 0 ? 'Total clasificado' : widget.retenciones ? 'Total retenido' : 'Total facturado'}: ${Formatters.currency.format(total / 100)}', style: Theme.of(context).textTheme.titleLarge),
          TaxBreakdown(lines: summary),
        ]))),
        if (widget.retenciones) const _ProfessionalCalculator(),
        const SizedBox(height: 16),
        Text('Comprobantes (${visible.length})', style: Theme.of(context).textTheme.titleLarge),
        if (!busy && visible.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Text('No hay comprobantes para esta empresa, período y categoría.')),
        ...visible.map((v) => Card(child: ExpansionTile(title: Text(v.razonSocialEmisor),
          subtitle: Text('${Formatters.date.format(v.fechaEmision)} · ${v.fuente} · ${v.tipoComprobante}${v.clasificacionPendiente ? ' · Pendiente de consulta al SRI' : ''}'),
          trailing: Text(Formatters.currency.format(v.importeTotal)), children: [
            ListTile(title: const Text('Clave de acceso'), subtitle: SelectableText(v.claveAcceso)),
            TaxBreakdown(lines: v.detalleImpuestos),
          ]))),
      ]));
  }
}

class _ProfessionalCalculator extends StatefulWidget {
  const _ProfessionalCalculator();
  @override
  State<_ProfessionalCalculator> createState() => _ProfessionalCalculatorState();
}
class _ProfessionalCalculatorState extends State<_ProfessionalCalculator> {
  bool natural = true;
  final base = TextEditingController();
  @override
  void dispose() { base.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) {
    final input = base.text.trim();
    final valid = RegExp(r'^\d+([,.]\d{1,2})?$').hasMatch(input);
    final cents = valid ? ((double.tryParse(input.replaceAll(',', '.')) ?? 0) * 100).round() : 0;
    return Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('Simulación · servicios profesionales'),
      const Text('Regla solicitada: persona natural 10 %; sociedad 5 %. No modifica las retenciones importadas.'),
      SwitchListTile(title: Text(natural ? 'Persona natural · 10 %' : 'Sociedad · 5 %'), value: natural, onChanged: (v) => setState(() => natural = v)),
      TextField(controller: base, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: 'Base sin IVA', errorText: input.isNotEmpty && !valid ? 'Usa un importe con máximo dos decimales' : null), onChanged: (_) => setState(() {})),
      Text('Retención calculada: ${Formatters.currency.format((cents * (natural ? 10 : 5) / 100).round() / 100)}'),
    ])));
  }
}
