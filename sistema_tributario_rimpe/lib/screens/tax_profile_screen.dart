import 'package:flutter/material.dart';
import '../models/company.dart';
import '../services/company_service.dart';
import '../services/api_exception.dart';

class TaxProfileScreen extends StatefulWidget {
  final Company company;
  final CompanyService service;
  const TaxProfileScreen({super.key, required this.company, required this.service});

  @override
  State<TaxProfileScreen> createState() => _TaxProfileScreenState();
}

class _TaxProfileScreenState extends State<TaxProfileScreen> {
  static const questions = {
    'realizaVentasGravadasIva': 'Realiza ventas gravadas con IVA',
    'realizaVentasTarifa0': 'Realiza ventas con tarifa 0 %',
    'obligadoLlevarContabilidad': 'Está obligado a llevar contabilidad',
    'esContribuyenteEspecial': 'Es contribuyente especial',
    'esAgenteRetencion': 'Está designado como agente de retención',
    'realizaOperacionesExterior': 'Realiza operaciones con el exterior',
    'superaFraccionBasicaRenta': 'Supera la fracción básica de renta del ejercicio',
    'realizaActividadesExcluidasRimpe': 'Realiza actividades excluidas del RIMPE',
  };
  static const duties = ['IVA', 'RETENCIONES EN LA FUENTE', 'ATS', 'IMPUESTO A LA RENTA'];
  final Map<String, dynamic> values = {};
  final Set<String> selected = {};
  bool saving = false;
  String? error;

  @override
  void initState() {
    super.initState();
    for (final key in [...questions.keys, 'tipoPersona', 'periodicidadIvaDeclarada']) {
      values[key] = widget.company.perfilTributario[key];
    }
    selected.addAll(List<String>.from(widget.company.perfilTributario['deberesFormalesRegistrados'] ?? []));
  }

  Future<void> save() async {
    setState(() { saving = true; error = null; });
    try {
      await widget.service.actualizarPerfil(widget.company.id, {
        ...values, 'deberesFormalesRegistrados': selected.toList(),
      });
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) setState(() => error = e.mensaje);
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Widget choice(String key, String label, Map<String, String> options) {
    final current = values[key];
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: DropdownButtonFormField<String>(
        initialValue: current == null ? '' : current.toString(),
        isExpanded: true,
        decoration: InputDecoration(labelText: label),
        items: [const DropdownMenuItem(value: '', child: Text('Sin confirmar')),
          ...options.entries.map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))],
        onChanged: saving ? null : (v) => setState(() {
          values[key] = v == '' ? null : questions.containsKey(key) ? v == 'true' : v;
        }),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Perfil tributario')),
    body: ListView(padding: const EdgeInsets.all(20), children: [
      Text(widget.company.razonSocial, style: Theme.of(context).textTheme.titleLarge),
      const SizedBox(height: 12),
      const Text('Completa los datos según el RUC y la situación del ejercicio que vas a revisar. Conserva “Sin confirmar” cuando no dispongas de respaldo. Estos cambios se usarán en las próximas evaluaciones de obligaciones.'),
      const SizedBox(height: 24),
      choice('tipoPersona', 'Tipo de contribuyente', {'NATURAL': 'Persona natural', 'SOCIEDAD': 'Sociedad'}),
      choice('periodicidadIvaDeclarada', 'Periodicidad de IVA registrada', {'MENSUAL': 'Mensual', 'SEMESTRAL': 'Semestral'}),
      ...questions.entries.map((e) => choice(e.key, e.value, {'true': 'Sí', 'false': 'No'})),
      const Text('Deberes formales que constan en el RUC'),
      const Text('Marca únicamente los confirmados. Dejar una casilla vacía no acredita una exención.'),
      ...duties.map((d) => CheckboxListTile(
        title: Text(d), value: selected.contains(d),
        onChanged: saving ? null : (v) => setState(() { v == true ? selected.add(d) : selected.remove(d); }),
      )),
      if (error != null) Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
      FilledButton(onPressed: saving ? null : save,
        child: Text(saving ? 'Guardando…' : 'Guardar perfil')),
    ]),
  );
}
