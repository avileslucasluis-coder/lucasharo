import 'dart:convert';
import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import '../models/company.dart';
import '../services/company_service.dart';
import '../services/sri_api_service.dart';
import '../services/api_exception.dart';

class SriScreen extends StatefulWidget {
  final CompanyService companies;
  final SriApiService sri;
  const SriScreen({super.key, required this.companies, required this.sri});

  @override
  State<SriScreen> createState() => _SriScreenState();
}

class _SriScreenState extends State<SriScreen> {
  final _clave = TextEditingController();
  List<Company> _empresas = [];
  Company? _empresa;
  List<Map<String, dynamic>> _documentos = [];
  bool _cargando = true;
  bool _ocupado = false;
  String? _error;
  String? _aviso;
  String? _xml;
  String? _nombreXml;
  String? _nombreCertificado;
  Uint8List? _certificado;

  @override
  void initState() { super.initState(); _iniciar(); }

  void _limpiarCertificado() {
    _certificado?.fillRange(0, _certificado!.length, 0);
    _certificado = null;
    _nombreCertificado = null;
    _clave.clear();
  }

  @override
  void dispose() { _limpiarCertificado(); _clave.dispose(); super.dispose(); }

  Future<void> _iniciar() async {
    setState(() { _cargando = true; _error = null; });
    try {
      final empresas = await widget.companies.listar();
      if (!mounted) return;
      setState(() { _empresas = empresas; _empresa = empresas.isEmpty ? null : empresas.first; });
      if (_empresa != null) await _actualizar();
    } catch (e) { if (mounted) setState(() => _error = _mensajeError(e)); }
    finally { if (mounted) setState(() => _cargando = false); }
  }

  String _mensajeError(Object e) => e is ApiException ? e.mensaje : 'No se pudo completar la operación. Revisa el archivo o vuelve a intentarlo.';

  Future<void> _actualizar() async {
    final empresaId = _empresa?.id;
    if (empresaId == null) return;
    final documentos = await widget.sri.listar(empresaId);
    if (mounted && _empresa?.id == empresaId) setState(() => _documentos = documentos);
  }

  Future<void> _accion(Future<void> Function() accion) async {
    if (_ocupado) return;
    setState(() { _ocupado = true; _error = null; _aviso = null; });
    try { await accion(); }
    catch (e) { if (mounted) setState(() => _error = _mensajeError(e)); }
    finally { if (mounted) setState(() => _ocupado = false); }
  }

  Future<void> _elegir(bool certificado) => _accion(() async {
    final seleccion = await FilePicker.platform.pickFiles(type: FileType.custom,
      allowedExtensions: certificado ? ['p12', 'pfx'] : ['xml'], withData: true);
    if (seleccion == null || !mounted) return;
    final archivo = seleccion.files.single;
    if (archivo.bytes == null || archivo.size > (certificado ? 1024 * 1024 : 320 * 1024)) {
      throw ApiException(400, certificado ? 'El certificado debe ocupar como máximo 1 MB.' : 'El XML debe ocupar como máximo 320 KB.');
    }
    if (certificado) {
      setState(() { _limpiarCertificado(); _certificado = archivo.bytes; _nombreCertificado = archivo.name; });
    } else {
      final contenido = utf8.decode(archivo.bytes!);
      setState(() { _xml = contenido; _nombreXml = archivo.name; });
    }
  });

  Future<void> _firmar() => _accion(() async {
    final empresaId = _empresa!.id;
    try {
      await widget.sri.firmar(empresaId, _xml!, base64Encode(_certificado!), _clave.text);
      if (!mounted) return;
      setState(() { _aviso = 'XML firmado y guardado. Revisa el comprobante antes de enviarlo a pruebas.'; _xml = null; _nombreXml = null; });
    } finally {
      if (mounted) setState(_limpiarCertificado);
    }
    await _actualizar();
  });

  Future<void> _operar(Map<String, dynamic> documento, String operacion) => _accion(() async {
    try {
      final resultado = await widget.sri.operar(_empresa!.id, documento['id'] as String, operacion);
      if (mounted) setState(() => _aviso = 'Estado: ${_estado(resultado['estado'] as String)}.');
    } finally { await _actualizar(); }
  });

  Future<void> _descargar(Map<String, dynamic> documento, bool autorizado) => _accion(() async {
    final detalle = await widget.sri.detalle(_empresa!.id, documento['id'] as String);
    final xml = detalle[autorizado ? 'xmlAutorizado' : 'xmlFirmado'] as String?;
    if (xml == null) throw ApiException(400, 'Todavía no hay un XML autorizado para descargar.');
    await FilePicker.platform.saveFile(dialogTitle: 'Guardar XML',
      fileName: '${autorizado ? 'autorizado' : 'firmado'}_${documento['claveAcceso']}.xml',
      type: FileType.custom, allowedExtensions: ['xml'], bytes: Uint8List.fromList(utf8.encode(xml)));
  });

  String _estado(String estado) => const {
    'FIRMADO': 'Firmado · pendiente de envío', 'ENVIANDO': 'Enviando', 'RECIBIDA': 'Recibido · falta autorización',
    'EN_PROCESO': 'En proceso en el SRI', 'POR_CONFIRMAR': 'Recepción por confirmar', 'CONSULTANDO': 'Consultando',
    'AUTORIZADO': 'Autorizado en pruebas', 'NO_AUTORIZADO': 'No autorizado', 'DEVUELTA': 'Devuelto por el SRI',
  }[estado] ?? estado;

  List<String> _mensajes(Map<String, dynamic> doc) {
    final resultado = <String>[];
    for (final origen in [doc['respuestaRecepcion'], doc['respuestaAutorizacion']]) {
      if (origen is! Map) continue;
      final registros = origen['comprobantes'] ?? origen['autorizaciones'] ?? [];
      if (registros is! List) continue;
      for (final registro in registros) {
        if (registro is! Map || registro['mensajes'] is! List) continue;
        for (final m in registro['mensajes'] as List) {
          if (m is Map) resultado.add('${m['identificador']}: ${m['mensaje']} ${m['informacionAdicional'] ?? ''}'.trim());
        }
      }
    }
    return resultado;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Comprobantes electrónicos'), actions: [
        IconButton(tooltip: 'Actualizar historial', onPressed: _ocupado || _cargando ? null : () => _accion(_actualizar), icon: const Icon(Icons.refresh)),
      ]),
      body: _cargando ? const Center(child: CircularProgressIndicator()) : ListView(
        padding: const EdgeInsets.all(20), children: [
          Wrap(spacing: 12, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
            Text('Conexión con el SRI', style: Theme.of(context).textTheme.headlineSmall),
            const Chip(avatar: Icon(Icons.science_outlined, size: 18), label: Text('AMBIENTE DE PRUEBAS')),
          ]),
          const SizedBox(height: 8),
          const Text('Los comprobantes de pruebas no tienen validez tributaria. Un documento recibido necesita una consulta de autorización para conocer el resultado final.'),
          const SizedBox(height: 20),
          if (_error != null) _notificacion(_error!, true),
          if (_aviso != null) _notificacion(_aviso!, false),
          if (_empresas.isEmpty) Card(child: Padding(padding: const EdgeInsets.all(24), child: Column(children: [
            const Icon(Icons.domain_add_outlined, size: 36), const SizedBox(height: 12),
            const Text('Registra una empresa para preparar comprobantes electrónicos.'),
            if (_error != null) TextButton(onPressed: _iniciar, child: const Text('Reintentar')),
          ]))) else ...[
            DropdownButtonFormField<Company>(initialValue: _empresa, isExpanded: true,
              decoration: const InputDecoration(labelText: 'Empresa emisora', prefixIcon: Icon(Icons.business_outlined)),
              items: _empresas.map((c) => DropdownMenuItem(value: c, child: Text('${c.razonSocial} · ${c.ruc}', overflow: TextOverflow.ellipsis))).toList(),
              onChanged: _ocupado ? null : (empresa) => _accion(() async {
                setState(() { _empresa = empresa; _documentos = []; _xml = null; _nombreXml = null; _limpiarCertificado(); });
                await _actualizar();
              })),
            const SizedBox(height: 20),
            Card(child: Padding(padding: const EdgeInsets.all(20), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('1. Preparar y firmar', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
              const Text('Carga un XML de comprobante SRI sin firma, con ambiente 1 y el RUC de esta empresa. Se comprueban la identidad, la clave de acceso y la firma; el SRI validará la estructura y las reglas tributarias.'),
              const SizedBox(height: 16),
              Wrap(spacing: 12, runSpacing: 12, children: [
                OutlinedButton.icon(onPressed: _ocupado ? null : () => _elegir(false), icon: const Icon(Icons.description_outlined), label: const Text('Elegir XML')),
                OutlinedButton.icon(onPressed: _ocupado ? null : () => _elegir(true), icon: const Icon(Icons.key_outlined), label: const Text('Elegir certificado .p12')),
              ]),
              if (_nombreXml != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text('XML: $_nombreXml')),
              if (_nombreCertificado != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Certificado: $_nombreCertificado')),
              const SizedBox(height: 16),
              ConstrainedBox(constraints: const BoxConstraints(maxWidth: 420), child: TextField(controller: _clave,
                enabled: !_ocupado, obscureText: true, autocorrect: false, enableSuggestions: false,
                decoration: const InputDecoration(labelText: 'Contraseña del certificado', prefixIcon: Icon(Icons.lock_outline)))),
              const SizedBox(height: 8),
              const Text('El certificado y la contraseña no se guardan en el servidor. Vuelve a seleccionarlos para cada firma.', style: TextStyle(fontSize: 12)),
              const SizedBox(height: 16),
              FilledButton.icon(onPressed: _ocupado || _xml == null || _certificado == null ? null : _firmar,
                icon: const Icon(Icons.draw_outlined), label: const Text('Firmar y guardar XML')),
            ]))),
            const SizedBox(height: 20),
            Text('2. Enviar y consultar', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            const Text('Últimos 100 comprobantes de esta empresa. Los envíos con respuesta incierta se consultan antes de cualquier reintento.'),
            const SizedBox(height: 12),
            if (_ocupado) const LinearProgressIndicator(),
            if (_documentos.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Text('Aún no hay comprobantes electrónicos preparados.')),
            ..._documentos.map(_tarjeta),
          ],
        ],
      ),
    );
  }

  Widget _notificacion(String texto, bool error) => Padding(padding: const EdgeInsets.only(bottom: 16), child: Container(
    padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: error ? Colors.red.shade50 : Colors.green.shade50, borderRadius: BorderRadius.circular(12)),
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Icon(error ? Icons.error_outline : Icons.check_circle_outline,
      color: error ? Colors.red.shade800 : Colors.green.shade800), const SizedBox(width: 12), Expanded(child: Text(texto))]),
  ));

  Widget _tarjeta(Map<String, dynamic> doc) {
    final estado = doc['estado'] as String;
    final color = estado == 'AUTORIZADO' ? Colors.green : ['DEVUELTA', 'NO_AUTORIZADO'].contains(estado) ? Colors.red : Colors.blueGrey;
    final mensajes = _mensajes(doc);
    return Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Wrap(spacing: 12, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
        Text(doc['tipoComprobante'] as String, style: const TextStyle(fontWeight: FontWeight.bold)),
        Chip(label: Text(_estado(estado)), backgroundColor: color.shade50, labelStyle: TextStyle(color: color.shade800)),
      ]),
      const SizedBox(height: 8), SelectableText(doc['claveAcceso'] as String, style: const TextStyle(fontSize: 12)),
      if (doc['ultimoError'] != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(doc['ultimoError'] as String, style: TextStyle(color: Colors.red.shade800))),
      if (mensajes.isNotEmpty) ExpansionTile(tilePadding: EdgeInsets.zero, title: const Text('Mensajes del SRI'), children: mensajes.map((m) => Padding(
        padding: const EdgeInsets.only(bottom: 8), child: Align(alignment: Alignment.centerLeft, child: SelectableText(m)))).toList()),
      const SizedBox(height: 12),
      Wrap(spacing: 8, runSpacing: 8, children: [
        if (estado == 'FIRMADO') FilledButton.icon(onPressed: _ocupado ? null : () => _operar(doc, 'send'), icon: const Icon(Icons.send_outlined), label: const Text('Enviar a pruebas')),
        if (estado != 'AUTORIZADO') OutlinedButton.icon(onPressed: _ocupado ? null : () => _operar(doc, 'authorization'), icon: const Icon(Icons.sync), label: const Text('Consultar autorización')),
        TextButton.icon(onPressed: _ocupado ? null : () => _descargar(doc, false), icon: const Icon(Icons.download_outlined), label: const Text('XML firmado')),
        if (estado == 'AUTORIZADO') TextButton.icon(onPressed: _ocupado ? null : () => _descargar(doc, true), icon: const Icon(Icons.verified_outlined), label: const Text('XML autorizado')),
      ]),
      if (['DEVUELTA', 'NO_AUTORIZADO'].contains(estado)) const Padding(padding: EdgeInsets.only(top: 8), child: Text('Corrige el XML y vuelve a firmarlo con la misma clave. Se conserva la versión anterior en la auditoría.')),
    ])));
  }
}
