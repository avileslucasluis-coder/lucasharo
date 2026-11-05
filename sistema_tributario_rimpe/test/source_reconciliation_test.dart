import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sistema_tributario_rimpe/screens/source_reconciliation_screen.dart';
import 'package:sistema_tributario_rimpe/services/api_client.dart';
import 'package:sistema_tributario_rimpe/services/declaration_api_service.dart';
import 'package:sistema_tributario_rimpe/services/session_storage.dart';

void main() {
  for (final width in [390.0, 1366.0]) {
    testWidgets('propuesta exige respaldo sin modificar liquidación en $width', (tester) async {
      tester.view.physicalSize = Size(width, 1000); tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize); addTearDown(tester.view.resetDevicePixelRatio);
      SharedPreferences.setMockInitialValues({});
      Map? posted;
      final document = {'id': 'voucher', 'tipo': 'FACTURA', 'emisor': 'Proveedor', 'clave': '123', 'iva': '15.00',
        'emissionPeriod': '2026-10', 'atsPeriod': '2026-11'};
      final api = ApiClient(SessionStorage(), onSesionInvalida: () {}, httpClient: MockClient((r) async {
        Object data;
        if (r.method == 'POST') { posted = jsonDecode(r.body) as Map; data = {}; }
        else if (r.url.path.endsWith('/sources')) { data = {'snapshot': {'documents': [document], 'complementary': []}}; }
        else { data = {'sourceHash': 'hash', 'document': document, 'history': [], 'stale': false}; }
        return http.Response(jsonEncode(data), r.method == 'POST' ? 201 : 200);
      }));
      addTearDown(api.close);
      await tester.pumpWidget(MaterialApp(home: SourceReconciliationScreen(service: DeclarationApiService(api), companyId: 'company', mes: 11, anio: 2026)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Decidir y ver historial')); await tester.pumpAndSettle();
      await tester.tap(find.text('Guardar propuesta')); await tester.pumpAndSettle();
      expect(posted, isNull);
      await tester.enterText(find.byType(TextFormField).at(0), 'Compra registrada en noviembre según libro');
      await tester.enterText(find.byType(TextFormField).at(1), 'Libro de compras 2026');
      await tester.tap(find.text('Guardar propuesta')); await tester.pumpAndSettle();
      expect(posted?['previousVersion'], 0);
      expect(posted?['choice'], 'PENDIENTE');
      expect(posted?['sourceHash'], 'hash');
      expect(find.text('Propuesta guardada con historial. La liquidación no cambió.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
