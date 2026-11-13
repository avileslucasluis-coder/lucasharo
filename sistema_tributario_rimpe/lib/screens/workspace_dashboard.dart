import 'package:flutter/material.dart';
import '../models/company.dart';
import '../models/voucher.dart';
import '../services/company_service.dart';
import '../services/voucher_service.dart';
import '../utils/app_theme.dart';

class DashboardScreen extends StatefulWidget {
  final CompanyService companies;
  final VoucherService vouchers;
  final ValueChanged<String> onNavigate;
  const DashboardScreen({super.key, required this.companies, required this.vouchers, required this.onNavigate});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  List<Company> companies = [];
  List<Voucher> vouchers = [];
  bool busy = true;
  String? error;
  final period = DateTime.now();
  static const ink = Color(0xFF153F42);
  static const teal = Color(0xFF137E75);
  @override
  void initState() { super.initState(); load(); }
  Future<void> load() async {
    setState(() { busy = true; error = null; });
    try {
      final list = await widget.companies.listar();
      final docs = await Future.wait(list.map((c) => widget.vouchers.listar(companyId: c.id, mes: period.month, anio: period.year)));
      if (!mounted) return;
      setState(() { companies = list; vouchers = docs.expand((v) => v).toList()..sort((a,b) => b.fechaEmision.compareTo(a.fechaEmision)); });
    } catch (_) { if (mounted) setState(() => error = 'No pudimos cargar tu resumen. Intenta de nuevo.'); }
    finally { if (mounted) setState(() => busy = false); }
  }
  @override
  Widget build(BuildContext context) {
    final ready = vouchers.where((v) => !v.clasificacionPendiente && v.direccion != 'NO_RELACIONADO');
    int cents(String direction, double Function(Voucher) value) => ready.where((v) => v.direccion == direction).fold(0, (s,v) => s + (value(v) * 100).round() * (v.tipoComprobante == 'NOTA_CREDITO' ? -1 : 1));
    final sales = cents('VENTA', (v) => v.importeTotal);
    final purchases = cents('COMPRA', (v) => v.importeTotal);
    final retained = cents('RETENCION_RECIBIDA', (v) => v.montoIva + v.montoRentaRetenida);
    final pending = vouchers.where((v) => v.clasificacionPendiente).length;
    final months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return Scaffold(backgroundColor: const Color(0xFFF4F6F2), body: RefreshIndicator(onRefresh: load,
      child: ListView(padding: EdgeInsets.all(MediaQuery.sizeOf(context).width < 600 ? 18 : 32), children: [
        Row(children: [const Icon(Icons.space_dashboard_rounded, color: teal), const SizedBox(width: 10),
          const Expanded(child: Text('DAYANEX / MI ESPACIO', style: TextStyle(fontWeight: FontWeight.w700, letterSpacing: 1.5, fontSize: 12, color: ink))),
          IconButton(onPressed: busy ? null : load, tooltip: 'Actualizar resumen', icon: const Icon(Icons.refresh, color: ink))]),
        const SizedBox(height: 20),
        Container(padding: const EdgeInsets.all(28), decoration: BoxDecoration(borderRadius: BorderRadius.circular(28),
          gradient: const LinearGradient(colors: [Color(0xFF123B40), Color(0xFF176D65)], begin: Alignment.topLeft, end: Alignment.bottomRight)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7), decoration: BoxDecoration(color: Colors.white.withValues(alpha: .12), borderRadius: BorderRadius.circular(20)),
              child: Text('${months[period.month - 1]} ${period.year} · Resumen del mes', style: const TextStyle(color: Color(0xFFD7EFC4), fontSize: 12))),
            const SizedBox(height: 22),
            const Text('Tus números claros.\nTu día más simple.', style: TextStyle(fontSize: 34, height: 1.15, fontWeight: FontWeight.w700, color: Colors.white)),
            const SizedBox(height: 14),
            const Text('Organiza tus empresas, carga comprobantes y prepara tus declaraciones desde un mismo espacio.', style: TextStyle(color: Color(0xFFCEE4DE), height: 1.6, fontSize: 15)),
            const SizedBox(height: 22),
            Wrap(spacing: 12, runSpacing: 10, children: [
              FilledButton.icon(onPressed: () => widget.onNavigate('Importar XML / TXT'), icon: const Icon(Icons.add_rounded), label: const Text('Cargar comprobantes'), style: FilledButton.styleFrom(backgroundColor: const Color(0xFFD9F0A4), foregroundColor: ink, padding: const EdgeInsets.all(20))),
              TextButton.icon(onPressed: () => widget.onNavigate('Declaraciones'), icon: const Icon(Icons.arrow_outward_rounded), label: const Text('Ir a declaraciones'), style: TextButton.styleFrom(foregroundColor: Colors.white, padding: const EdgeInsets.all(20))),
            ]),
          ])),
        const SizedBox(height: 24),
        if (busy) const LinearProgressIndicator(color: teal),
        if (error != null) Card(child: ListTile(leading: const Icon(Icons.cloud_off), title: Text(error!), trailing: TextButton(onPressed: load, child: const Text('Reintentar')))),
        LayoutBuilder(builder: (context, constraints) {
          final columns = constraints.maxWidth >= 1000 ? 4 : constraints.maxWidth >= 500 ? 2 : 1;
          final items = [
            _Metric('Empresas', '${companies.length}', 'Registradas en tu cuenta', Icons.domain_rounded, const Color(0xFFE0ECD9)),
            _Metric('Ventas del mes', Formatters.currency.format(sales / 100), 'Facturas menos notas de crédito', Icons.north_east_rounded, const Color(0xFFDDEEF0)),
            _Metric('Compras del mes', Formatters.currency.format(purchases / 100), 'Comprobantes clasificados', Icons.south_west_rounded, const Color(0xFFEEE6D7)),
            _Metric('Retenciones recibidas', Formatters.currency.format(retained / 100), 'IVA y renta del mes', Icons.percent_rounded, const Color(0xFFE7E2EF)),
          ];
          return Wrap(spacing: 14, runSpacing: 14, children: items.map((m) => SizedBox(width: (constraints.maxWidth - (columns-1)*14)/columns, child: m)).toList());
        }),
        const SizedBox(height: 28),
        const Text('¿Por dónde empezamos?', style: TextStyle(fontSize: 22, color: ink, fontWeight: FontWeight.w700)),
        const SizedBox(height: 14),
        LayoutBuilder(builder: (context,c) => Wrap(spacing: 12, runSpacing: 12, children: [
          _Shortcut('Empresas', 'Administra tus negocios', Icons.business_rounded),
          _Shortcut('Facturas', 'Revisa bases y tarifas de IVA', Icons.receipt_long_rounded),
          _Shortcut('Retenciones', 'Consulta IVA y renta', Icons.pie_chart_outline_rounded),
        ].map((s) => SizedBox(width: c.maxWidth >= 750 ? (c.maxWidth-24)/3 : c.maxWidth,
          child: Card(margin: EdgeInsets.zero, elevation: 0, color: Colors.white, child: ListTile(contentPadding: const EdgeInsets.all(16),
            leading: Icon(s.icon, color: teal), title: Text(s.title, style: const TextStyle(fontWeight: FontWeight.w700)), subtitle: Text(s.subtitle),
            trailing: const Icon(Icons.chevron_right), onTap: () => widget.onNavigate(s.title))))).toList())),
        const SizedBox(height: 24),
        Container(padding: const EdgeInsets.all(20), decoration: BoxDecoration(color: pending > 0 ? const Color(0xFFFFEBC8) : const Color(0xFFE3EDDF), borderRadius: BorderRadius.circular(20)),
          child: Row(children: [Icon(pending > 0 ? Icons.pending_actions_rounded : Icons.task_alt_rounded, color: ink), const SizedBox(width: 14),
            Expanded(child: Text(busy ? 'Revisando tus comprobantes…' : error != null ? 'Actualiza el resumen para revisar pendientes.' : pending > 0 ? '$pending comprobantes pendientes de consulta al SRI. Abre Facturas o Retenciones para seguir el avance.' : vouchers.isEmpty ? 'Tu espacio está listo. Agrega una empresa y carga tus primeros comprobantes.' : 'No tienes comprobantes pendientes de detalle este mes.', style: const TextStyle(color: ink, height: 1.5))),
          ])),
        const SizedBox(height: 28),
        const Text('Últimos comprobantes del mes', style: TextStyle(fontSize: 20, color: ink, fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        if (!busy && error == null && vouchers.isEmpty) Container(padding: const EdgeInsets.all(28), decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
          child: const Column(children: [Icon(Icons.folder_open_rounded, size: 44, color: teal), SizedBox(height: 12), Text('Aquí comienza el orden', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)), SizedBox(height: 6), Text('Tus archivos XML y TXT aparecerán aquí al importarlos.', textAlign: TextAlign.center)])),
        ...vouchers.take(5).map((v) => Card(elevation: 0, color: Colors.white, child: ListTile(
          leading: CircleAvatar(backgroundColor: const Color(0xFFE3EDDF), child: Icon(v.clasificacionPendiente ? Icons.hourglass_top : Icons.description_outlined, color: teal)),
          title: Text(v.razonSocialEmisor, maxLines: 1, overflow: TextOverflow.ellipsis),
          subtitle: Text('${Formatters.date.format(v.fechaEmision)} · ${v.direccionLabel}\n${Formatters.currency.format(v.importeTotal)}${v.clasificacionPendiente ? ' · Pendiente' : ''}'),
          isThreeLine: true, trailing: const Icon(Icons.chevron_right), onTap: () => widget.onNavigate(v.tipoComprobante == 'RETENCION' ? 'Retenciones' : 'Facturas')))),
        const SizedBox(height: 20),
        const Text('DAYANEX · Hecho para mantener tus cuentas en orden', style: TextStyle(fontSize: 11, color: Color(0xFF6B817B))),
      ])));
  }
}
class _Metric extends StatelessWidget {
  final String title, value, subtitle;
  final IconData icon;
  final Color color;
  const _Metric(this.title,this.value,this.subtitle,this.icon,this.color);
  @override
  Widget build(BuildContext context) => Container(padding: const EdgeInsets.all(22), decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(22)), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Row(children: [Expanded(child: Text(title, style: const TextStyle(fontSize: 13, color: Color(0xFF5D7370)))), Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(10)), child: Icon(icon, size: 20, color: const Color(0xFF153F42)))]),
    const SizedBox(height: 18), FittedBox(fit: BoxFit.scaleDown, child: Text(value, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: Color(0xFF153F42)))),
    const SizedBox(height: 8), Text(subtitle, style: const TextStyle(fontSize: 11, color: Color(0xFF71847D))),
  ]));
}
class _Shortcut {
  final String title, subtitle;
  final IconData icon;
  const _Shortcut(this.title,this.subtitle,this.icon);
}
