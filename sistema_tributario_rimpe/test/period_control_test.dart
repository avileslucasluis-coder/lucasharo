import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sistema_tributario_rimpe/screens/period_control_screen.dart';
import 'package:sistema_tributario_rimpe/services/api_client.dart';
import 'package:sistema_tributario_rimpe/services/declaration_api_service.dart';
import 'package:sistema_tributario_rimpe/services/session_storage.dart';

void main() {
  for (final width in [390.0, 1366.0]) {
    testWidgets('cierre exige justificación y conserva versión en $width px', (tester) async {
      tester.view.physicalSize = Size(width, 900); tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize); addTearDown(tester.view.resetDevicePixelRatio);
      SharedPreferences.setMockInitialValues({});
      Map<String, dynamic>? posted;
      final api = ApiClient(SessionStorage(), onSesionInvalida: () {}, httpClient: MockClient((request) async {
        if (request.method == 'POST') posted = jsonDecode(request.body) as Map<String, dynamic>;
        final data = request.method == 'POST' ? {} : [{'version': posted == null ? 3 : 4, 'snapshot': {
          'estado': posted == null ? 'APROBADA' : 'CERRADA', 'liquidacion': {'detalleComprobantes': []},
        }}];
        return http.Response(jsonEncode(data), request.method == 'POST' ? 201 : 200);
      }));
      addTearDown(api.close);
      await tester.pumpWidget(MaterialApp(home: PeriodControlScreen(service: DeclarationApiService(api), companyId: 'company', periodicidad: 'MENSUAL', mes: 10, anio: 2026)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cerrar período')); await tester.pumpAndSettle();
      await tester.tap(find.text('Confirmar')); await tester.pumpAndSettle();
      expect(posted, isNull);
      await tester.enterText(find.byType(TextFormField), 'Revisión documentada de comprobantes y saldos');
      await tester.tap(find.text('Confirmar')); await tester.pumpAndSettle();
      expect(posted?['revision'], 3); expect(posted?['accion'], 'CERRAR');
      expect(find.text('Reabrir con justificación'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
