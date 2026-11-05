import 'package:flutter/material.dart';

class TaxAdjustmentsScreen extends StatefulWidget {
  final bool annual;
  final String regimen;
  final Map<String, String> initial;
  const TaxAdjustmentsScreen({super.key, required this.annual, required this.regimen, this.initial = const {}});
  @override
  State<TaxAdjustmentsScreen> createState() => _TaxAdjustmentsScreenState();
}

class _TaxAdjustmentsScreenState extends State<TaxAdjustmentsScreen> {
  final form = GlobalKey<FormState>();
  final controls = <String, TextEditingController>{};
  static const iva = {
    'factorCredito': 'Factor de crédito tributario (0 a 1)',
    'ivaSinDerechoCredito': 'IVA de compras sin derecho a crédito',
    'creditoAnteriorCompras': 'Saldo anterior por compras e importaciones',
    'creditoAnteriorRetenciones': 'Saldo anterior por retenciones de IVA',
    'ajusteCreditoCompras': 'IVA devuelto o rechazado: adquisiciones',
    'ajusteCreditoRetenciones': 'IVA devuelto o rechazado: retenciones',
    'multa104': 'Multa confirmada formulario 104',
    'interes104': 'Interés confirmado formulario 104',
    'multa103': 'Multa confirmada formulario 103',
    'interes103': 'Interés confirmado formulario 103',
  };
  static const renta = {
    'ingresosBrutos': 'Ingresos brutos del ejercicio (sin IVA)',
    'devolucionesDescuentos': 'Devoluciones y descuentos',
    'ingresosExentos': 'Ingresos exentos sustentados',
    'gastosDeducibles': 'Gastos deducibles conciliados',
    'ajustesAumentan': 'Ajustes que aumentan la base',
    'ajustesDisminuyen': 'Ajustes que disminuyen la base',
    'rebajaGastosPersonales': 'Rebaja de gastos personales verificada',
    'retencionesRenta': 'Retenciones de renta del ejercicio',
    'creditoAnteriorRenta': 'Crédito anterior de renta',
    'anticiposRenta': 'Anticipos de renta',
    'multaRenta': 'Multa confirmada de renta',
    'interesRenta': 'Interés confirmado de renta',
    'tarifaSociedad': 'Tarifa efectiva de sociedad (%)',
    'fundamentoTarifa': 'Fundamento de la tarifa societaria',
  };
  Map<String, String> get fields => {
    ...(widget.annual ? renta : iva), 'justificacion': 'Respaldo y explicación de la conciliación',
  };
  @override
  void initState() {
    super.initState();
    for (final k in fields.keys) { controls[k] = TextEditingController(text: widget.initial[k] ?? (k == 'factorCredito' ? '1' : '')); }
  }
  @override
  void dispose() { for (final c in controls.values) { c.dispose(); } super.dispose(); }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(widget.annual ? 'Conciliación anual de renta' : 'Conciliación de IVA y retenciones')),
    body: Form(key: form, child: ListView(padding: const EdgeInsets.all(20), children: [
      Text('Régimen: ${widget.regimen}'),
      Text(widget.annual
        ? 'Registra importes conciliados del ejercicio. Los XML pueden no incluir todos los ingresos, cobros o gastos. Para RIMPE no ingreses gastos deducibles ni rebaja personal sobre sus ingresos. En sociedades de régimen general confirma la tarifa y su fundamento.'
        : 'Confirma qué IVA de compras da derecho a crédito y el factor aplicable. Los saldos anteriores deben venir de la declaración anterior; no se arrastran automáticamente desde un borrador. Multas e intereses se ingresan desde su cálculo verificado.'),
      const SizedBox(height: 20),
      if (!widget.annual) const Card(child: Padding(padding: EdgeInsets.all(16), child: Text(
        '¿Primera declaración en este sistema?\nConsulta tu última declaración válida del SRI correspondiente al período anterior. Registra por separado el saldo por adquisiciones e importaciones y el saldo por retenciones de IVA. En el formulario que usa las casillas 615 y 617, toma esos saldos finales, respectivamente. No copies las compras del mes ni sumes ambos saldos en un solo campo.\n\nEn el respaldo indica el período y número de la declaración. Si no tienes saldo previo, confirma cero. Los datos se guardan al generar el papel de trabajo.'
      ))),
      ...fields.entries.map((e) {
        final text = ['justificacion', 'fundamentoTarifa'].contains(e.key);
        return Padding(padding: const EdgeInsets.only(bottom: 16), child: TextFormField(
          controller: controls[e.key], maxLines: text ? 3 : 1,
          keyboardType: text ? TextInputType.multiline : const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(labelText: e.value, hintText: text ? null : '0.00'),
          validator: (value) {
            final v = (value ?? '').trim().replaceAll(',', '.');
            if (e.key == 'justificacion') return v.length < 10 ? 'Explica el respaldo (mínimo 10 caracteres).' : null;
            if (e.key == 'ingresosBrutos' && v.isEmpty) return 'Confirma los ingresos, incluso si son cero.';
            if (v.isEmpty || text) return null;
            if (!RegExp(e.key == 'factorCredito' ? r'^(0(\.\d{1,6})?|1(\.0{1,6})?)$' : r'^\d{1,9}(\.\d{1,2})?$').hasMatch(v)) return 'Importe o factor inválido.';
            return null;
          },
        ));
      }),
      FilledButton(onPressed: () {
        if (!form.currentState!.validate()) return;
        Navigator.pop(context, {for (final e in controls.entries)
          if (e.value.text.trim().isNotEmpty) e.key: ['justificacion', 'fundamentoTarifa'].contains(e.key) ? e.value.text.trim() : e.value.text.trim().replaceAll(',', '.')});
      }, child: const Text('Confirmar datos de conciliación')),
    ])),
  );
}
