import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sistema_tributario_rimpe/screens/ats_operations_screen.dart';
import 'package:sistema_tributario_rimpe/services/api_client.dart';
import 'package:sistema_tributario_rimpe/services/session_storage.dart';

void main() {
  for (final width in [360.0, 1366.0]) {
    testWidgets('edita operación ATS con versión y empresa en $width px',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      Map<String, dynamic>? saved;
      final api = ApiClient(SessionStorage(), onSesionInvalida: () {},
          httpClient: MockClient((request) async {
        if (request.method == 'POST') {
          saved = jsonDecode(request.body);
          return http.Response('{}', 201);
        }
        expect(request.url.queryParameters['companyId'], 'empresa');
        if (request.url.path.endsWith('operation-schemas')) {
          return http.Response(
              jsonEncode([
                {
                  'kind': 'ANULADO',
                  'label': 'Comprobantes anulados',
                  'section': 'anulados',
                  'fields': [
                    {
                      'name': 'autorizacion',
                      'type': 'string',
                      'required': true,
                      'repeated': false
                    },
                  ]
                }
              ]),
              200,
              headers: {'content-type': 'application/json; charset=utf-8'});
        }
        if (request.url.path.endsWith('/operations')) {
          return http.Response(
              jsonEncode([
                {
                  'id': 'operacion',
                  'kind': 'ANULADO',
                  'reference': 'Anulación documentada de prueba',
                  'version': 3,
                  'data': {'autorizacion': '1234567890'}
                }
              ]),
              200,
              headers: {'content-type': 'application/json; charset=utf-8'});
        }
        return http.Response('[]', 200);
      }));
      addTearDown(api.close);
      await tester.pumpWidget(MaterialApp(
          home: AtsOperationsScreen(
              api: api, companyId: 'empresa', mes: 10, anio: 2026)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Comprobantes anulados'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final button = find.text('Validar y guardar');
      await tester.scrollUntilVisible(button, 300,
          scrollable: find.byType(Scrollable).last);
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(saved?['version'], 3);
      expect(saved?['companyId'], 'empresa');
      expect(saved?['data'], {'autorizacion': '1234567890'});
      expect(tester.takeException(), isNull);
    });
  }
}
