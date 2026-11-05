import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sistema_tributario_rimpe/screens/xml_import_screen.dart';
import 'package:sistema_tributario_rimpe/services/api_client.dart';
import 'package:sistema_tributario_rimpe/services/session_storage.dart';
import 'package:sistema_tributario_rimpe/services/company_service.dart';
import 'package:sistema_tributario_rimpe/services/voucher_service.dart';

void main() {
  testWidgets('retoma pendientes, reintenta fallos transitorios y conserva los no disponibles', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final attempts = <String, int>{};
    final api = ApiClient(SessionStorage(), onSesionInvalida: () {}, httpClient: MockClient((request) async {
      Object data;
      var status = 200;
      if (request.url.path == '/api/companies') {
        data = [{'id': 'empresa', 'ruc': '0912345678001', 'razonSocial': 'Prueba', 'regimen': 'GENERAL'}];
      } else if (request.url.path.endsWith('/pending-details')) {
        expect(request.url.queryParameters['companyId'], 'empresa');
        data = [{'claveAcceso': 'primero'}, {'claveAcceso': 'segundo'}];
      } else {
        expect(request.url.path, '/api/vouchers/complete-sri');
        final body = jsonDecode(request.body);
        expect(body['companyId'], 'empresa');
        final key = body['claveAcceso'] as String;
        attempts[key] = (attempts[key] ?? 0) + 1;
        status = key == 'segundo' ? 400 : attempts[key] == 1 ? 502 : 200;
        data = status == 200 ? {'completado': true} : {'message': 'XML aún no disponible'};
      }
      return http.Response(jsonEncode(data), status, headers: {'content-type': 'application/json; charset=utf-8'});
    }));
    addTearDown(api.close);
    await tester.pumpWidget(MaterialApp(home: XmlImportScreen(companies: CompanyService(api), vouchers: VoucherService(api))));
    await tester.pumpAndSettle();
    final retry = find.text('Completar / reintentar pendientes');
    await tester.ensureVisible(retry);
    await tester.tap(retry);
    await tester.pumpAndSettle();
    expect(attempts, {'primero': 2, 'segundo': 1});
    await tester.drag(find.byType(ListView).first, const Offset(0, -500));
    await tester.pumpAndSettle();
    expect(find.text('1 completados con detalle del SRI · 1 pendientes de reintento'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
