import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import '../models/company.dart';
import '../models/tax_declaration.dart';
import '../services/company_service.dart';
import '../services/declaration_api_service.dart';
import '../services/ats_api_service.dart';
import '../services/api_exception.dart';
import '../utils/app_theme.dart';
import 'tax_adjustments_screen.dart';
import 'tax_ledger_screen.dart';
import 'ats_review_screen.dart';
import 'ats_operations_screen.dart';
import 'filings_screen.dart';
import 'period_control_screen.dart';
import 'source_reconciliation_screen.dart';

class DeclaracionesScreen extends StatefulWidget {
  final CompanyService companies;
  final DeclarationApiService declarations;
  final AtsApiService ats;
  const DeclaracionesScreen({super.key, required this.companies, required this.declarations, required this.ats});

  @override
  State<DeclaracionesScreen> createState() => _DeclaracionesScreenState();
}

class _DeclaracionesScreenState extends State<DeclaracionesScreen> {
  List<Company> _empresas = [];
  Company? _seleccionada;
  int _mes = DateTime.now().month;
  int _anio = DateTime.now().year;
  String _periodicidad = 'MENSUAL';
  Map<String, String>? _ajustes;

  Future<void> _conciliar({bool usarAnterior = false}) async {
    if (_seleccionada == null) return;
    if (_ajustes == null) {
      try {
        final companyId = _seleccionada!.id;
        final mes = _mes, anio = _anio, periodicidad = _periodicidad;
        final history = await widget.declarations.historial(companyId: companyId, mes: mes, anio: anio, periodicidad: periodicidad);
        if (!mounted || _seleccionada?.id != companyId || _mes != mes || _anio != anio || _periodicidad != periodicidad) return;
        if (history.isNotEmpty) {
          final saved = history.last['snapshot']?['ajustes'];
          if (saved is Map) _ajustes = saved.map((k,v) => MapEntry(k.toString(), v.toString()));
        }
      } on ApiException catch (e) {
        if (mounted) setState(() => _error = e.mensaje);
        return;
      }
    }
    if (!mounted) return;
    var initial = Map<String, String>.from(_ajustes ?? {});
    if (usarAnterior) {
      final companyId = _seleccionada!.id;
      final mes = _mes, anio = _anio, periodicidad = _periodicidad;
      try {
        final data = await widget.declarations.api.get('/api/declarations/previous-balance', query: {
          'companyId': companyId, 'mes': '$mes', 'anio': '$anio', 'periodicidad': periodicidad,
        }) as Map;
        if (!mounted || _seleccionada?.id != companyId || _mes != mes || _anio != anio || _periodicidad != periodicidad) return;
        final accepted = await showDialog<bool>(context: context, builder: (context) => AlertDialog(
          title: const Text('Revisar saldos anteriores'),
          content: Text('${data['aviso']}\n\nPeríodo: ${data['mes']}/${data['anio']} · versión ${data['revision']}\nRespaldo: ${data['respaldo']}\nAdquisiciones: \$${data['creditoAnteriorCompras']}\nRetenciones: \$${data['creditoAnteriorRetenciones']}\n\nAl aceptar se reemplazan únicamente los dos saldos anteriores en el formulario de conciliación.'),
          actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Coinciden con mi declaración'))],
        ));
        if (!mounted || accepted != true) return;
        initial.addAll({'creditoAnteriorCompras': '${data['creditoAnteriorCompras']}', 'creditoAnteriorRetenciones': '${data['creditoAnteriorRetenciones']}'});
      } on ApiException catch (e) {
        if (mounted) setState(() => _error = e.mensaje);
        return;
      }
    }
    if (!mounted) return;
    final result = await Navigator.push<Map<String, String>>(context, MaterialPageRoute(builder: (_) =>
      TaxAdjustmentsScreen(annual: _periodicidad == 'ANUAL', regimen: _seleccionada!.regimen, initial: initial)));
    if (mounted && result != null) setState(() { _ajustes = result; _resultado = null; });
  }

  TaxDeclarationResult? _resultado;
  bool _descargando = false;

  Future<void> _descargarReporte() async {
    final result = _resultado;
    final company = _seleccionada;
    if (result == null || company == null) return;
    setState(() { _descargando = true; _error = null; });
    try {
      final data = await widget.declarations.api.get('/api/declarations/report', query: {
        'companyId': company.id, 'declarationId': result.id, 'version': '${result.revision}',
      }) as Map;
      if (!mounted) return;
      await Share.shareXFiles([XFile.fromData(Uint8List.fromList(utf8.encode(data['content'] as String)),
        name: data['filename'] as String, mimeType: 'text/csv')], fileNameOverrides: [data['filename'] as String], subject: 'Sistema Tributario · Papel de trabajo');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    } catch (_) {
      if (mounted) setState(() => _error = 'No se pudo descargar el reporte. Intenta nuevamente.');
    } finally {
      if (mounted) setState(() => _descargando = false);
    }
  }
  bool _cargandoEmpresas = true;
  bool _generando = false;
  bool _procesandoAts = false;
  bool _presentando = false;
  bool _presentadaLocal = false;
  bool get _ocupado => _generando || _procesandoAts || _presentando || _descargando;
  String? _error;
  AtsValidacion? _validacionAts;

  @override
  void initState() {
    super.initState();
    _cargarEmpresas();
  }

  Future<void> _cargarEmpresas() async {
    try {
      final lista = await widget.companies.listar();
      if (!mounted) return;
      setState(() {
        _empresas = lista;
        _seleccionada = lista.isNotEmpty ? lista.first : null;
        _cargandoEmpresas = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.mensaje;
        _cargandoEmpresas = false;
      });
    }
  }

  Future<void> _generar() async {
    if (_seleccionada == null) return;
    if (_periodicidad == 'ANUAL' && _ajustes == null) {
      await _conciliar();
      if (!mounted || _ajustes == null) return;
    }
    setState(() {
      _generando = true;
      _presentadaLocal = false;
      _error = null;
    });
    try {
      final r = await widget.declarations.generar(companyId: _seleccionada!.id, mes: _mes, anio: _anio, periodicidad: _periodicidad, ajustes: _ajustes);
      if (!mounted) return;
      setState(() => _resultado = r);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.mensaje);
    } finally {
      if (mounted) setState(() => _generando = false);
    }
  }

  Future<void> _marcarPresentada() async {
    if (_seleccionada == null || _ocupado) return;
    setState(() { _presentando = true; _error = null; });
    try {
      await widget.declarations.presentar(companyId: _seleccionada!.id, mes: _mes, anio: _anio, periodicidad: _periodicidad);
      if (!mounted) return;
      setState(() => _presentadaLocal = true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.mensaje);
    } finally {
      if (mounted) setState(() => _presentando = false);
    }
  }

  Future<void> _verHistorial() async {
    final empresa = _seleccionada;
    if (empresa == null || _ocupado) return;
    final mes = _mes, anio = _anio;
    setState(() { _generando = true; _error = null; });
    try {
      final versiones = await widget.declarations.historial(companyId: empresa.id, mes: mes, anio: anio, periodicidad: _periodicidad);
      if (!mounted) return;
      setState(() => _generando = false);
      await showModalBottomSheet<void>(
        context: context, isScrollControlled: true,
        builder: (_) => SafeArea(child: SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.75,
          child: ListView(padding: const EdgeInsets.all(20), children: [
            Text('Historial ${_periodicidad == 'ANUAL' ? 'anual' : _periodicidad == 'SEMESTRAL' ? 'semestre ${mes ~/ 6}' : 'mes $mes'}/$anio', style: Theme.of(context).textTheme.titleLarge),
            Text(empresa.razonSocial),
            const SizedBox(height: 12),
            const Text('El registro manual indica una acción del usuario; no confirma recepción ni pago ante el SRI.'),
            if (versiones.isEmpty) const Padding(
              padding: EdgeInsets.all(24), child: Text('Todavía no hay versiones para este período.')),
            ...versiones.reversed.map((v) {
              final datos = Map<String, dynamic>.from(v['snapshot'] as Map? ?? {});
              final fecha = DateTime.tryParse(v['createdAt']?.toString() ?? '')?.toLocal();
              return ExpansionTile(
                title: Text('Versión ${v['version']} · ${v['action']}'),
                subtitle: Text(fecha?.toString().split('.').first ?? 'Fecha no disponible'),
                children: [
                  ListTile(title: const Text('Estado'), subtitle: Text('${datos['estado'] ?? '—'}')),
                  if (datos['id'] != null) TextButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) =>
                    FilingsScreen(api: widget.declarations.api, companyId: empresa.id, declarationId: datos['id'],
                      revision: v['version'], annual: datos['periodicidad'] == 'ANUAL'))), child: const Text('Presentaciones, pagos y respaldos')),
                  if (datos['liquidacion'] is Map) ...Map<String, dynamic>.from(datos['liquidacion']).entries
                    .where((e) => ['baseImponible', 'impuestoCausado', 'totalRentaAPagar', 'saldoFavorRenta', 'totalAPagar104', 'totalAPagar103'].contains(e.key))
                    .map((e) => ListTile(title: Text(e.key), trailing: Text('${e.value}'))),
                  ...const {
                    'totalVentasGravadas': 'Ventas gravadas',
                    'totalVentas0': 'Ventas tarifa 0 %',
                    'totalIvaVentas': 'IVA en ventas',
                    'totalComprasGravadas': 'Compras gravadas',
                    'totalCompras0': 'Compras tarifa 0 %',
                    'totalIvaCompras': 'IVA en compras',
                    'totalIvaRetenidoEnVentas': 'IVA retenido en ventas',
                    'totalRetencionesIvaAplicadas': 'Retenciones de IVA aplicadas',
                    'totalRetencionesRentaAplicadas': 'Retenciones de renta aplicadas',
                  }.entries.where((e) => datos.containsKey(e.key)).map((e) =>
                    ListTile(title: Text(e.value), trailing: Text('${datos[e.key]}'))),
                ],
              );
            }),
          ]),
        )),
      );
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    } finally {
      if (mounted) setState(() => _generando = false);
    }
  }

  Future<void> _validarAts() async {
    if (_seleccionada == null) return;
    setState(() {
      _procesandoAts = true;
      _error = null;
    });
    try {
      final v = await widget.ats.validar(companyId: _seleccionada!.id, mes: _mes, anio: _anio);
      if (!mounted) return;
      setState(() => _validacionAts = v);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.mensaje);
    } finally {
      if (mounted) setState(() => _procesandoAts = false);
    }
  }

  Future<void> _generarYDescargarAts() async {
    if (_seleccionada == null) return;
    setState(() {
      _procesandoAts = true;
      _error = null;
    });
    try {
      final validacion = await widget.ats.validar(companyId: _seleccionada!.id, mes: _mes, anio: _anio);
      if (!mounted) return;
      setState(() => _validacionAts = validacion);
      if (validacion.errores.isNotEmpty) throw ApiException(400, 'Corrige los errores indicados antes de descargar el borrador ATS.');
      final xml = await widget.ats.generar(companyId: _seleccionada!.id, mes: _mes, anio: _anio);
      final bytes = Uint8List.fromList(utf8.encode(xml));
      await Share.shareXFiles(
        [XFile.fromData(bytes, name: 'ats_${_seleccionada!.ruc}_${_mes}_$_anio.xml', mimeType: 'text/xml')],
        subject: 'ATS $_mes/$_anio — ${_seleccionada!.razonSocial}',
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.mensaje);
    } finally {
      if (mounted) setState(() => _procesandoAts = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_cargandoEmpresas) return const Scaffold(body: Center(child: CircularProgressIndicator()));

    return Scaffold(
      appBar: AppBar(title: const Text('Declaraciones y ATS')),
      body: _empresas.isEmpty
          ? Center(child: Text('Registra una empresa primero.', style: TextStyle(color: Colors.grey.shade600)))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        DropdownButtonFormField<Company>(
                          value: _seleccionada,
                          decoration: const InputDecoration(labelText: 'Empresa'),
                          items: _empresas.map((c) => DropdownMenuItem(value: c, child: Text(c.razonSocial))).toList(),
                          onChanged: _ocupado ? null : (v) => setState(() {
                            _seleccionada = v;
                            _ajustes = null;
                            _resultado = null;
                            _validacionAts = null;
                          }),
                        ),
                        const SizedBox(height: 12),
                        DropdownButtonFormField<String>(
                          initialValue: _periodicidad,
                          decoration: const InputDecoration(labelText: 'Período del papel de trabajo'),
                          items: const [
                            DropdownMenuItem(value: 'MENSUAL', child: Text('Mensual')),
                            DropdownMenuItem(value: 'SEMESTRAL', child: Text('Semestral')),
                            DropdownMenuItem(value: 'ANUAL', child: Text('Anual · Renta')),
                          ],
                          onChanged: _ocupado ? null : (v) => setState(() {
                            _periodicidad = v!;
                            _ajustes = null;
                            if (v == 'ANUAL') _mes = 12;
                            if (v == 'SEMESTRAL') _mes = _mes <= 6 ? 6 : 12;
                            _resultado = null;
                            _presentadaLocal = false;
                            _validacionAts = null;
                          }),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: DropdownButtonFormField<int>(
                                key: ValueKey('$_periodicidad-$_mes'),
                                value: _mes,
                                decoration: InputDecoration(labelText: _periodicidad == 'ANUAL' ? 'Ejercicio completo' : _periodicidad == 'SEMESTRAL' ? 'Semestre' : 'Mes'),
                                items: (_periodicidad == 'ANUAL' ? [12] : _periodicidad == 'SEMESTRAL' ? [6, 12] : List.generate(12, (i) => i + 1))
                                    .map((m) => DropdownMenuItem(value: m, child: Text(_periodicidad == 'ANUAL' ? 'Enero – diciembre' : _periodicidad == 'SEMESTRAL' ? (m == 6 ? 'Enero – junio' : 'Julio – diciembre') : _nombreMes(m))))
                                    .toList(),
                                onChanged: _ocupado ? null : (v) => setState(() {
                                  _mes = v!;
                                  _ajustes = null;
                                  _resultado = null;
                                  _validacionAts = null;
                                }),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: DropdownButtonFormField<int>(
                                value: _anio,
                                decoration: const InputDecoration(labelText: 'Año'),
                                items: List.generate(5, (i) => DateTime.now().year - i)
                                    .map((a) => DropdownMenuItem(value: a, child: Text('$a')))
                                    .toList(),
                                onChanged: _ocupado ? null : (v) => setState(() {
                                  _anio = v!;
                                  _ajustes = null;
                                  _resultado = null;
                                  _validacionAts = null;
                                }),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        OutlinedButton.icon(onPressed: _ocupado ? null : _conciliar,
                          icon: const Icon(Icons.edit_note), label: Text(_ajustes == null ? 'Saldos iniciales y conciliación' : 'Conciliación preparada · editar')),
                        ElevatedButton.icon(
                          onPressed: _ocupado ? null : _generar,
                          icon: _generando
                              ? const SizedBox(
                                  width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : const Icon(Icons.calculate),
                          label: Text(_generando ? 'Calculando...' : 'Generar papel de trabajo ${_periodicidad == 'ANUAL' ? 'anual' : _periodicidad == 'SEMESTRAL' ? 'semestral' : 'mensual'}'),
                        ),
                        if (_periodicidad != 'ANUAL') TextButton.icon(
                          onPressed: _ocupado || _seleccionada == null ? null : () => _conciliar(usarAnterior: true),
                          icon: const Icon(Icons.compare_arrows),
                          label: const Text('Revisar saldos del período anterior'),
                        ),
                        TextButton.icon(
                          onPressed: _ocupado || _seleccionada == null ? null : () async {
                            await Navigator.push(context, MaterialPageRoute(builder: (_) => PeriodControlScreen(service: widget.declarations,
                              companyId: _seleccionada!.id, mes: _mes, anio: _anio, periodicidad: _periodicidad)));
                            if (mounted) setState(() => _resultado = null);
                          }, icon: const Icon(Icons.lock_outline), label: const Text('Revisar y cerrar período')),
                        TextButton.icon(
                          onPressed: _ocupado ? null : _verHistorial,
                          icon: const Icon(Icons.history),
                          label: const Text('Ver historial del período'),
                        ),
                      ],
                    ),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(color: AppTheme.danger)),
                ],
                if (_resultado != null) ...[
                  const Text('Totales de facturas y retenciones por tarifa', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  Card(child: TaxBreakdown(lines: (_resultado!.liquidacion['desgloseTarifas'] as List? ?? []).map((e) => Map<String, dynamic>.from(e)).toList())),
                  OutlinedButton.icon(onPressed: _ocupado ? null : _descargarReporte,
                    icon: const Icon(Icons.download), label: Text(_descargando ? 'Preparando reporte…' : 'Descargar papel de trabajo (Excel / CSV)')),
                  const SizedBox(height: 20),
                  OutlinedButton.icon(icon: const Icon(Icons.attach_file), label: const Text('Registrar presentación o pago'),
                    onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => FilingsScreen(
                      api: widget.declarations.api, companyId: _seleccionada!.id, declarationId: _resultado!.id,
                      revision: _resultado!.revision, annual: _periodicidad == 'ANUAL')))),
                  if (_periodicidad == 'ANUAL') Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Liquidación anual de renta', style: TextStyle(fontWeight: FontWeight.bold)),
                      ...const {'baseImponible': 'Base imponible', 'impuestoCausado': 'Impuesto causado', 'rebajaAplicada': 'Rebaja aplicada',
                        'impuestoRentaAPagar': 'Renta a pagar', 'saldoFavorRenta': 'Saldo a favor', 'totalRentaAPagar': 'Total con multa e interés'}
                        .entries.map((e) => ListTile(title: Text(e.value), trailing: Text('\$${_resultado!.liquidacion[e.key] ?? 0}'))),
                      ..._resultado!.advertencias.map((a) => Text(a)),
                    ]))),
                  if (_periodicidad != 'ANUAL')
                  _TarjetaDeclaracion(resultado: _resultado!, presentadaLocal: _presentadaLocal,
                    onMarcarPresentada: _ocupado ? null : _marcarPresentada),
                ],
                const SizedBox(height: 24),
                if (_periodicidad == 'SEMESTRAL') const Text('Este consolidado corresponde al papel de trabajo de impuestos. La generación de ATS disponible actualmente se consulta en el período mensual.'),
                if (_periodicidad == 'MENSUAL' && _seleccionada != null) OutlinedButton.icon(
                  onPressed: _ocupado ? null : () => Navigator.push(context, MaterialPageRoute(builder: (_) => SourceReconciliationScreen(
                    service: widget.declarations, companyId: _seleccionada!.id, mes: _mes, anio: _anio))),
                  icon: const Icon(Icons.compare_arrows), label: const Text('Conciliar fuentes y períodos IVA–ATS')),
                if (_periodicidad == 'MENSUAL') Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Anexo Transaccional Simplificado (ATS)',
                            style: TextStyle(fontWeight: FontWeight.bold, color: AppTheme.primary)),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 12,
                          runSpacing: 8,
                          children: [
                            OutlinedButton.icon(
                              onPressed: _ocupado ? null : _validarAts,
                              icon: const Icon(Icons.fact_check_outlined),
                              label: const Text('Validar ATS'),
                            ),
                            OutlinedButton.icon(
                              onPressed: _ocupado || _seleccionada == null ? null : () => Navigator.push(context, MaterialPageRoute(builder: (_) => AtsReviewScreen(api: widget.ats.api, companyId: _seleccionada!.id, mes: _mes, anio: _anio))),
                              icon: const Icon(Icons.edit_note),
                              label: const Text('Revisar datos ATS'),
                            ),
                            OutlinedButton.icon(
                              onPressed: _ocupado || _seleccionada == null ? null : () => Navigator.push(context, MaterialPageRoute(builder: (_) => AtsOperationsScreen(api: widget.ats.api, companyId: _seleccionada!.id, mes: _mes, anio: _anio))),
                              icon: const Icon(Icons.post_add),
                              label: const Text('Operaciones especiales'),
                            ),
                            ElevatedButton.icon(
                              onPressed: _ocupado ? null : _generarYDescargarAts,
                              icon: const Icon(Icons.download),
                              label: const Text('Descargar borrador XML'),
                            ),
                          ],
                        ),
                        if (_validacionAts != null) ...[
                          const SizedBox(height: 16),
                          if (_validacionAts!.errores.isEmpty && _validacionAts!.advertencias.isEmpty)
                            Text('Sin errores ni advertencias.', style: TextStyle(color: AppTheme.primary)),
                          ..._validacionAts!.errores.map((e) => _FilaValidacion(mensaje: e.mensaje, esError: true)),
                          ..._validacionAts!.advertencias.map((e) => _FilaValidacion(mensaje: e.mensaje, esError: false)),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  String _nombreMes(int m) {
    const nombres = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    return nombres[m - 1];
  }
}

class _FilaValidacion extends StatelessWidget {
  final String mensaje;
  final bool esError;
  const _FilaValidacion({required this.mensaje, required this.esError});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(esError ? Icons.error : Icons.warning_amber, size: 18, color: esError ? AppTheme.danger : AppTheme.accent),
          const SizedBox(width: 8),
          Expanded(child: Text(mensaje, style: const TextStyle(fontSize: 13))),
        ],
      ),
    );
  }
}

class _TarjetaDeclaracion extends StatelessWidget {
  final TaxDeclarationResult resultado;
  final VoidCallback? onMarcarPresentada;
  final bool presentadaLocal;
  const _TarjetaDeclaracion({required this.resultado, required this.onMarcarPresentada, required this.presentadaLocal});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 12,
              children: [
                Text(resultado.periodicidad == 'SEMESTRAL'
                  ? 'Resumen semestral ${resultado.mes == 6 ? 'enero – junio' : 'julio – diciembre'} / ${resultado.anio}'
                  : 'Resumen mensual ${resultado.mes}/${resultado.anio}',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                Chip(
                  label: Text(presentadaLocal ? 'PRESENTACIÓN REGISTRADA LOCALMENTE' : resultado.estado),
                  backgroundColor: presentadaLocal ? AppTheme.primary.withValues(alpha: 0.15) : Colors.grey.shade200,
                ),
              ],
            ),
            const SizedBox(height: 12),
            ...resultado.advertencias.map((a) => Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(a, style: const TextStyle(fontSize: 12)))),
            _tituloFormulario('Papel de trabajo para formulario 104 · IVA'),
            _fila('Ventas gravadas con IVA', resultado.totalVentasGravadas),
            _fila('Ventas tarifa 0%', resultado.totalVentas0),
            _fila('IVA cobrado en ventas (débito)', resultado.totalIvaVentas),
            const SizedBox(height: 8),
            _fila('Compras gravadas con IVA', resultado.totalComprasGravadas),
            _fila('Compras tarifa 0%', resultado.totalCompras0),
            _fila('IVA de compras (revisar derecho a crédito tributario)', resultado.totalIvaCompras),
            const SizedBox(height: 8),
            _fila('IVA que te retuvieron en ventas', resultado.totalIvaRetenidoEnVentas),
            _fila('Saldo anterior por compras e importaciones', double.tryParse('${resultado.liquidacion['creditoAnteriorCompras'] ?? 0}') ?? 0),
            _fila('Saldo anterior por retenciones de IVA', double.tryParse('${resultado.liquidacion['creditoAnteriorRetenciones'] ?? 0}') ?? 0),
            const Divider(),
            _fila('IVA propio estimado', resultado.ivaAPagar104),
            _fila('IVA retenido a proveedores', resultado.totalRetencionesIvaAplicadas),
            _fila('Total estimado formulario 104', resultado.totalAPagar104, destacado: true),
            if (resultado.creditoTributarioSiguientePeriodo > 0)
              _fila('Crédito tributario a favor (siguiente periodo)', resultado.creditoTributarioSiguientePeriodo,
                  color: AppTheme.secondary),
            if (resultado.liquidacion.containsKey('creditoSiguienteCompras')) ...[
              _fila('Del saldo siguiente: compras e importaciones', double.tryParse('${resultado.liquidacion['creditoSiguienteCompras']}') ?? 0),
              _fila('Del saldo siguiente: retenciones de IVA', double.tryParse('${resultado.liquidacion['creditoSiguienteRetenciones']}') ?? 0),
            ],
            const SizedBox(height: 20),
            _tituloFormulario('Papel de trabajo para formulario 103 · Retenciones de renta'),
            _fila('Renta retenida a proveedores', resultado.totalRetencionesRentaAplicadas),
            const Divider(),
            _fila('Total estimado formulario 103', resultado.totalAPagar103, destacado: true, color: AppTheme.danger),
            if (resultado.rentaRetenidaEnVentasInformativo > 0) ...[
              const SizedBox(height: 20),
              _tituloFormulario('Informativo · Renta retenida en tus ventas'),
              _fila('Crédito para tu declaración anual', resultado.rentaRetenidaEnVentasInformativo),
            ],
            const SizedBox(height: 16),
            const Text('La declaración se presenta en SRI en Línea. Este botón solo registra que ya la presentaste; no realiza un envío al SRI.', style: TextStyle(fontSize: 12)),
            const SizedBox(height: 8),
            if (!presentadaLocal)
              ElevatedButton.icon(
                onPressed: onMarcarPresentada,
                icon: const Icon(Icons.check),
                label: const Text('Registrar presentación realizada en SRI'),
              ),
          ],
        ),
      ),
    );
  }

  Widget _tituloFormulario(String texto) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(texto, style: TextStyle(fontWeight: FontWeight.bold, color: AppTheme.primary, fontSize: 13)),
      );

  Widget _fila(String etiqueta, double valor, {bool destacado = false, Color? color}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(child: Text(etiqueta, style: TextStyle(fontWeight: destacado ? FontWeight.bold : FontWeight.normal))),
          Text(
            Formatters.currency.format(valor),
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: color ?? (destacado ? AppTheme.primary : Colors.black87),
              fontSize: destacado ? 16 : 14,
            ),
          ),
        ],
      ),
    );
  }
}
