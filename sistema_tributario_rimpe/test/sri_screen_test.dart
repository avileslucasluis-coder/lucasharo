import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sistema_tributario_rimpe/screens/sri_screen.dart';
import 'package:sistema_tributario_rimpe/services/api_client.dart';
import 'package:sistema_tributario_rimpe/services/company_service.dart';
import 'package:sistema_tributario_rimpe/services/session_storage.dart';
import 'package:sistema_tributario_rimpe/services/sri_api_service.dart';

void main() {
  for (final ancho in [390.0, 1366.0]) {
    testWidgets('SRI diferencia recepción y autorización en $ancho px', (tester) async {
      SharedPreferences.setMockInitialValues({});
      tester.view.physicalSize = Size(ancho, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var estado = 'RECIBIDA';
      var consultas = 0;
      final api = ApiClient(SessionStorage(), onSesionInvalida: () {}, httpClient: MockClient((request) async {
        if (request.url.path == '/api/companies') return http.Response(jsonEncode([
          {'id': 'empresa', 'ruc': '1790012345001', 'razonSocial': 'Empresa de pruebas', 'regimen': 'GENERAL'}]), 200);
        if (request.method == 'POST') {
          expect(request.url.path, '/api/sri/documents/documento/authorization');
          expect(jsonDecode(request.body)['companyId'], 'empresa');
          consultas++;
          estado = 'AUTORIZADO';
          return http.Response(jsonEncode({'estado': estado}), 201);
        }
        return http.Response(jsonEncode([{'id': 'documento', 'tipoComprobante': 'factura', 'estado': estado,
          'claveAcceso': '2210202601179001234500110010010000000011234567810'}]), 200);
      }));
      addTearDown(api.close);
      await tester.pumpWidget(MaterialApp(home: SriScreen(companies: CompanyService(api), sri: SriApiService(api))));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final consultar = find.text('Consultar autorización');
      await tester.scrollUntilVisible(consultar, 400, scrollable: find.byType(Scrollable).first);
      expect(find.text('Recibido · falta autorización'), findsOneWidget);
      expect(find.text('Enviar a pruebas'), findsNothing);
      await tester.tap(consultar);
      await tester.pumpAndSettle();
      expect(consultas, 1);
      expect(find.text('Autorizado en pruebas'), findsOneWidget);
      expect(find.text('XML autorizado'), findsOneWidget);
      expect(find.text('Consultar autorización'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}
