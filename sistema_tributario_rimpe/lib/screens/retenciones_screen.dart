import 'package:flutter/material.dart';
import '../models/company.dart';
import '../models/voucher.dart';
import '../services/company_service.dart';
import '../services/voucher_service.dart';
import '../services/api_exception.dart';
import '../utils/app_theme.dart';

class RetencionesScreen extends StatefulWidget {
  final CompanyService companies;
  final VoucherService vouchers;
  const RetencionesScreen({super.key, required this.companies, required this.vouchers});

  @override
  State<RetencionesScreen> createState() => _RetencionesScreenState();
}

class _RetencionesScreenState extends State<RetencionesScreen> {
  List<Company> _empresas = [];
  Company? _seleccionada;
  List<Voucher> _comprobantes = [];
  bool _cargando = true;
  String? _error;
  String _direccion = 'RETENCION_RECIBIDA';

  @override
  void initState() {
    super.initState();
    _cargarInicial();
  }

  Future<void> _cargarInicial() async {
    try {
      final empresas = await widget.companies.listar();
      if (!mounted) return;
      setState(() {
        _empresas = empresas;
        _seleccionada = empresas.isNotEmpty ? empresas.first : null;
      });
      if (_seleccionada != null) await _cargarComprobantes();
      if (mounted && _seleccionada == null) setState(() => _cargando = false);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.mensaje;
        _cargando = false;
      });
    }
  }

  Future<void> _cargarComprobantes() async {
    if (_seleccionada == null) return;
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final lista = await widget.vouchers.listar(companyId: _seleccionada!.id);
      if (!mounted) return;
      setState(() {
        _comprobantes = lista.where((v) => v.tipoComprobante == 'RETENCION' &&
          ['RETENCION_RECIBIDA', 'RETENCION_EMITIDA'].contains(v.direccion)).toList();
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
    final visibles = _comprobantes.where((v) => v.direccion == _direccion).toList();
    final totalIva = visibles.fold<double>(0, (s, v) => s + v.montoIva);
    final totalRenta = visibles.fold<double>(0, (s, v) => s + v.montoRentaRetenida);

    return Scaffold(
      appBar: AppBar(title: const Text('Comprobantes de retención')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_empresas.isNotEmpty)
                  DropdownButtonFormField<Company>(
                    value: _seleccionada,
                    decoration: const InputDecoration(labelText: 'Empresa'),
                    items: _empresas.map((c) => DropdownMenuItem(value: c, child: Text(c.razonSocial))).toList(),
                    onChanged: _cargando ? null : (v) {
                      setState(() => _seleccionada = v);
                      _cargarComprobantes();
                    },
                  ),
                const SizedBox(height: 12),
                const Text('Valores de XML de retención importados. Una compra por sí sola no genera una retención.'),
                const SizedBox(height: 8),
                Wrap(spacing: 8, children: [
                  ChoiceChip(label: const Text('Recibidas'), selected: _direccion == 'RETENCION_RECIBIDA',
                    onSelected: (_) => setState(() => _direccion = 'RETENCION_RECIBIDA')),
                  ChoiceChip(label: const Text('Emitidas'), selected: _direccion == 'RETENCION_EMITIDA',
                    onSelected: (_) => setState(() => _direccion = 'RETENCION_EMITIDA')),
                ]),
                Row(
                  children: [
                    Expanded(
                      child: _ResumenChip(
                          titulo: 'Total IVA retenido', valor: Formatters.currency.format(totalIva), color: AppTheme.primary),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _ResumenChip(
                          titulo: 'Total Renta retenida', valor: Formatters.currency.format(totalRenta), color: AppTheme.secondary),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Expanded(
            child: _cargando
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(child: Text(_error!, style: TextStyle(color: AppTheme.danger)))
                    : visibles.isEmpty
                        ? Center(
                            child: Text(
                              'No hay retenciones importadas en esta categoría.\nCarga sus archivos en Importar XML / TXT.',
                              textAlign: TextAlign.center,
                              style: TextStyle(color: Colors.grey.shade600),
                            ),
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            itemCount: visibles.length,
                            itemBuilder: (context, i) {
                              final v = visibles[i];
                              return Card(
                                child: ListTile(
                                  leading: CircleAvatar(
                                    backgroundColor: AppTheme.accent.withOpacity(0.15),
                                    child: Icon(Icons.percent, color: AppTheme.accent),
                                  ),
                                  title: Text(_direccion == 'RETENCION_RECIBIDA' ? v.razonSocialEmisor : (v.razonSocialContraparte ?? v.identificacionContraparte ?? 'Sujeto retenido')),
                                  subtitle: Text(
                                    'IVA ${Formatters.currency.format(v.montoIva)} · Renta ${Formatters.currency.format(v.montoRentaRetenida)}',
                                  ),
                                  trailing: Text(
                                    Formatters.currency.format(v.montoIva + v.montoRentaRetenida),
                                    style: const TextStyle(fontWeight: FontWeight.bold),
                                  ),
                                ),
                              );
                            },
                          ),
          ),
        ],
      ),
    );
  }
}

class _ResumenChip extends StatelessWidget {
  final String titulo;
  final String valor;
  final Color color;
  const _ResumenChip({required this.titulo, required this.valor, required this.color});

  @override
  Widget build(BuildContext context) {
    return Card(
      color: color.withOpacity(0.08),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(titulo, style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
            const SizedBox(height: 4),
            Text(valor, style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: color)),
          ],
        ),
      ),
    );
  }
}
