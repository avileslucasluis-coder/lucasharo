import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import '../models/company.dart';
import '../services/company_service.dart';
import '../services/voucher_service.dart';
import '../services/api_exception.dart';
import '../utils/app_theme.dart';

class XmlImportScreen extends StatefulWidget {
  final CompanyService companies;
  final VoucherService vouchers;
  const XmlImportScreen({super.key, required this.companies, required this.vouchers});

  @override
  State<XmlImportScreen> createState() => _XmlImportScreenState();
}

class _XmlImportScreenState extends State<XmlImportScreen> {
  List<Company> _empresas = [];
  Company? _seleccionada;
  bool _procesando = false;
  String _avance = '';
  String _sentido = 'RECIBIDOS';
  final List<_ResultadoImportacion> _resultados = [];

  Future<void> _completarPendientes(String empresaId) async {
    try {
      final claves = await widget.vouchers.pendientesDetalle(empresaId);
      var completados = 0;
      var fallidos = 0;
      for (var i = 0; i < claves.length; i++) {
        if (i > 0) await Future<void>.delayed(const Duration(milliseconds: 600));
        if (!mounted) return;
        setState(() => _avance = 'Consultando SRI: ${i + 1} de ${claves.length}');
        try {
          try {
            await widget.vouchers.completarSri(empresaId, claves[i]);
          } on ApiException catch (e) {
            if (e.statusCode != 0 && e.statusCode < 500) rethrow;
            await Future<void>.delayed(const Duration(seconds: 2));
            if (!mounted) return;
            await widget.vouchers.completarSri(empresaId, claves[i]);
          }
          completados++;
        } catch (e) {
          fallidos++;
          if (!mounted) return;
          setState(() => _resultados.insert(0, _ResultadoImportacion(
            nombreArchivo: 'Consulta pendiente · ${claves[i]}', exito: false,
            mensaje: e is ApiException ? e.mensaje : 'No se pudo completar la consulta. Puedes reintentar.',
          )));
        }
      }
      if (!mounted) return;
      setState(() => _resultados.insert(0, _ResultadoImportacion(
        nombreArchivo: 'Clasificación automática', exito: fallidos == 0,
        mensaje: claves.isEmpty ? 'No quedan comprobantes pendientes.' : '$completados completados con detalle del SRI · $fallidos pendientes de reintento',
      )));
    } catch (e) {
      if (!mounted) return;
      setState(() => _resultados.insert(0, _ResultadoImportacion(
        nombreArchivo: 'Consulta de pendientes', exito: false,
        mensaje: e is ApiException ? e.mensaje : 'No se pudo consultar. Reintenta más tarde.',
      )));
    }
  }

  Future<void> _reintentar() async {
    final empresaId = _seleccionada?.id;
    if (empresaId == null || _procesando) return;
    setState(() { _procesando = true; _avance = 'Buscando pendientes...'; });
    await _completarPendientes(empresaId);
    if (mounted) setState(() { _procesando = false; _avance = ''; });
  }

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
      });
    } on ApiException catch (_) {
      // el mensaje ya se muestra en otras pantallas; aquí basta con
      // dejar la lista vacía y que el usuario reintente.
    }
  }

  Future<void> _seleccionarYSubirArchivos() async {
    if (_seleccionada == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Primero selecciona una empresa.')));
      return;
    }

    final empresaId = _seleccionada!.id;
    final resultado = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['xml', 'txt'],
      allowMultiple: true,
      withData: true,
    );
    if (resultado == null || !mounted) return;

    setState(() { _procesando = true; _avance = 'Importando archivos...'; });

    for (final archivo in resultado.files) {
      try {
        if (archivo.bytes == null) throw Exception('No se pudo leer el contenido del archivo.');
        String contenido;
        try { contenido = utf8.decode(archivo.bytes!); }
        on FormatException { contenido = latin1.decode(archivo.bytes!); }

        if (archivo.name.toLowerCase().endsWith('.txt')) {
          final result = await widget.vouchers.importarTxt(companyId: empresaId, contenido: contenido, sentido: _sentido);
          if (!mounted) return;
          setState(() => _resultados.insert(0, _ResultadoImportacion(nombreArchivo: archivo.name, exito: true,
            mensaje: '${result['importados']} importados · ${result['duplicados']} ya registrados. Consultando el detalle automáticamente...')));
          continue;
        }
        final voucher = await widget.vouchers.importarXml(
          companyId: empresaId,
          xmlContent: contenido,
        );

        if (!mounted) return;
        setState(() {
          _resultados.insert(
            0,
            _ResultadoImportacion(
              nombreArchivo: archivo.name,
              exito: true,
              mensaje: '${voucher.tipoComprobante} (${voucher.direccionLabel}) · ${voucher.razonSocialEmisor}',
            ),
          );
        });
      } on ApiException catch (e) {
        if (!mounted) return;
        setState(() {
          _resultados.insert(0, _ResultadoImportacion(nombreArchivo: archivo.name, exito: false, mensaje: e.mensaje));
        });
      } catch (e) {
        if (!mounted) return;
        setState(() {
          _resultados.insert(0, _ResultadoImportacion(nombreArchivo: archivo.name, exito: false, mensaje: '$e'));
        });
      }
    }

    if (!mounted) return;
    await _completarPendientes(empresaId);
    if (mounted) setState(() { _procesando = false; _avance = ''; });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Importar comprobantes XML / TXT')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: ListView(
          children: [
            const Text('Del TXT a tus impuestos, automáticamente', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text(
              'Sube el TXT del SRI. Buscamos los XML por sus claves de acceso y clasificamos las bases, el IVA y las retenciones. '
              'Mantén esta pantalla abierta hasta terminar. Si se interrumpe, puedes reintentar los pendientes.',
              style: TextStyle(color: Colors.grey.shade600),
            ),
            const SizedBox(height: 20),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('1. Selecciona la empresa', style: TextStyle(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    _empresas.isEmpty
                        ? Text('No tienes empresas registradas todavía.', style: TextStyle(color: AppTheme.danger))
                        : DropdownButtonFormField<Company>(isExpanded: true,
                            value: _seleccionada,
                            items: _empresas
                                .map((c) => DropdownMenuItem(value: c, child: Text('${c.razonSocial} (${c.ruc})')))
                                .toList(),
                            onChanged: _procesando ? null : (v) => setState(() => _seleccionada = v),
                          ),
                    const SizedBox(height: 20),
                    DropdownButtonFormField<String>(isExpanded: true, value: _sentido, decoration: const InputDecoration(labelText: 'TXT del SRI'), items: const [DropdownMenuItem(value: 'RECIBIDOS', child: Text('Comprobantes recibidos')), DropdownMenuItem(value: 'EMITIDOS', child: Text('Comprobantes emitidos'))], onChanged: _procesando ? null : (v) => setState(() => _sentido = v!)),
                    const SizedBox(height: 12),
                    const Text('2. Sube uno o varios archivos .xml o .txt', style: TextStyle(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    ElevatedButton.icon(
                      onPressed: _procesando || _empresas.isEmpty ? null : _seleccionarYSubirArchivos,
                      icon: _procesando
                          ? const SizedBox(
                              width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Icon(Icons.upload_file),
                      label: Text(_procesando ? 'Subiendo...' : 'Elegir archivos XML / TXT'),
                    ),
                    const SizedBox(height: 8),
                    TextButton.icon(
                      onPressed: _procesando || _seleccionada == null ? null : _reintentar,
                      icon: const Icon(Icons.sync),
                      label: const Text('Completar / reintentar pendientes'),
                    ),
                    if (_procesando) Text(_avance, style: const TextStyle(fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            if (_resultados.isNotEmpty) ...[
              const Text('Resultado de la importación', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: _resultados.length,
                  itemBuilder: (context, i) {
                    final r = _resultados[i];
                    return Card(
                      child: ListTile(
                        leading: Icon(r.exito ? Icons.check_circle : Icons.error,
                            color: r.exito ? AppTheme.primary : AppTheme.danger),
                        title: Text(r.nombreArchivo),
                        subtitle: Text(r.mensaje),
                      ),
                    );
                  },
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ResultadoImportacion {
  final String nombreArchivo;
  final bool exito;
  final String mensaje;
  _ResultadoImportacion({required this.nombreArchivo, required this.exito, required this.mensaje});
}
