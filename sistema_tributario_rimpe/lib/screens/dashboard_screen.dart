import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import '../models/company.dart';
import '../models/voucher.dart';
import '../services/company_service.dart';
import '../services/voucher_service.dart';
import '../services/api_exception.dart';
import '../utils/app_theme.dart';

class DashboardScreen extends StatefulWidget {
  final CompanyService companies;
  final VoucherService vouchers;
  const DashboardScreen({super.key, required this.companies, required this.vouchers});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  List<Company> _empresas = [];
  List<Voucher> _comprobantes = [];
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
      final empresas = await widget.companies.listar();
      final comprobantesPorEmpresa = await Future.wait(
        empresas.map((c) => widget.vouchers.listar(companyId: c.id)),
      );
      if (!mounted) return;
      setState(() {
        _empresas = empresas;
        _comprobantes = comprobantesPorEmpresa.expand((l) => l).toList();
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

  @override
  Widget build(BuildContext context) {
    if (_cargando) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.cloud_off, size: 48, color: AppTheme.danger),
              const SizedBox(height: 12),
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              OutlinedButton(onPressed: _cargar, child: const Text('Reintentar')),
            ],
          ),
        ),
      );
    }

    final recibidas = _comprobantes.where((v) => v.direccion == 'RETENCION_RECIBIDA');
    final totalIvaRetenido = recibidas.fold<double>(0, (s, v) => s + v.montoIva);
    final totalRentaRetenido = recibidas.fold<double>(0, (s, v) => s + v.montoRentaRetenida);
    final totalFacturado = _comprobantes.where((v) => v.direccion == 'VENTA').fold<double>(0,
      (s, v) => s + (v.tipoComprobante == 'NOTA_CREDITO' ? -1 : 1) * v.importeTotal);

    return RefreshIndicator(
      onRefresh: _cargar,
      child: CustomScrollView(
        slivers: [
          const SliverAppBar(title: Text('Sistema Tributario RIMPE'), pinned: true, floating: true),
          SliverPadding(
            padding: const EdgeInsets.all(16),
            sliver: SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Panel general', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  Text('Resumen de empresas y sus obligaciones tributarias.', style: TextStyle(color: Colors.grey.shade600)),
                  const SizedBox(height: 20),
                  LayoutBuilder(builder: (context, constraints) {
                    final columnas = constraints.maxWidth > 900 ? 4 : (constraints.maxWidth > 600 ? 2 : 1);
                    final tarjetas = [
                      _TarjetaResumen(titulo: 'Empresas', valor: '${_empresas.length}', icono: Icons.domain, color: AppTheme.primary),
                      _TarjetaResumen(
                          titulo: 'Comprobantes procesados', valor: '${_comprobantes.length}', icono: Icons.receipt_long, color: AppTheme.secondary),
                      _TarjetaResumen(
                          titulo: 'Total facturado', valor: Formatters.currency.format(totalFacturado), icono: Icons.attach_money, color: AppTheme.accent),
                      _TarjetaResumen(
                          titulo: 'Retenciones recibidas',
                          valor: Formatters.currency.format(totalIvaRetenido + totalRentaRetenido),
                          icono: Icons.savings,
                          color: AppTheme.danger),
                    ];
                    return GridView.count(
                      crossAxisCount: columnas,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      crossAxisSpacing: 12,
                      mainAxisSpacing: 12,
                      childAspectRatio: 2.2,
                      children: tarjetas,
                    );
                  }),
                  const SizedBox(height: 24),
                  if (_comprobantes.isNotEmpty) ...[
                    const Text('Comprobantes por dirección', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 12),
                    SizedBox(
                      height: 220,
                      child: Card(
                        child: Padding(padding: const EdgeInsets.all(16), child: _GraficoDireccion(comprobantes: _comprobantes)),
                      ),
                    ),
                    const SizedBox(height: 24),
                  ],
                  const Text('Últimos comprobantes importados', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  if (_comprobantes.isEmpty)
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: Column(
                          children: [
                            Icon(Icons.description_outlined, size: 48, color: Colors.grey.shade400),
                            const SizedBox(height: 12),
                            Text(
                              'Aún no has importado comprobantes.\nVe a "Importar XML / TXT" para comenzar.',
                              textAlign: TextAlign.center,
                              style: TextStyle(color: Colors.grey.shade600),
                            ),
                          ],
                        ),
                      ),
                    )
                  else
                    ...(_comprobantes.reversed.take(5).map((v) => Card(
                          child: ListTile(
                            leading: CircleAvatar(
                              backgroundColor: AppTheme.primary.withOpacity(0.1),
                              child: Icon(Icons.description, color: AppTheme.primary),
                            ),
                            title: Text(v.razonSocialEmisor),
                            subtitle: Text('${v.tipoComprobante} · ${v.direccionLabel} · ${Formatters.date.format(v.fechaEmision)}'),
                            trailing: Text(Formatters.currency.format(v.importeTotal), style: const TextStyle(fontWeight: FontWeight.bold)),
                          ),
                        ))),
                  const SizedBox(height: 40),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TarjetaResumen extends StatelessWidget {
  final String titulo;
  final String valor;
  final IconData icono;
  final Color color;
  const _TarjetaResumen({required this.titulo, required this.valor, required this.icono, required this.color});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            CircleAvatar(backgroundColor: color.withOpacity(0.12), child: Icon(icono, color: color)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(titulo, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  const SizedBox(height: 2),
                  FittedBox(fit: BoxFit.scaleDown, child: Text(valor, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold))),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GraficoDireccion extends StatelessWidget {
  final List<Voucher> comprobantes;
  const _GraficoDireccion({required this.comprobantes});

  @override
  Widget build(BuildContext context) {
    final Map<String, int> conteo = {};
    for (final v in comprobantes) {
      conteo[v.direccionLabel] = (conteo[v.direccionLabel] ?? 0) + 1;
    }
    final colores = [AppTheme.primary, AppTheme.secondary, AppTheme.accent, AppTheme.danger, Colors.grey];
    final entradas = conteo.entries.toList();

    return Row(
      children: [
        Expanded(
          flex: 2,
          child: PieChart(
            PieChartData(
              sectionsSpace: 3,
              centerSpaceRadius: 32,
              sections: List.generate(entradas.length, (i) {
                final e = entradas[i];
                return PieChartSectionData(
                  value: e.value.toDouble(),
                  title: '${e.value}',
                  color: colores[i % colores.length],
                  radius: 60,
                  titleStyle: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
                );
              }),
            ),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          flex: 3,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(entradas.length, (i) {
              final e = entradas[i];
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    Container(width: 12, height: 12, color: colores[i % colores.length]),
                    const SizedBox(width: 8),
                    Expanded(child: Text('${e.key} (${e.value})', style: const TextStyle(fontSize: 12))),
                  ],
                ),
              );
            }),
          ),
        ),
      ],
    );
  }
}
