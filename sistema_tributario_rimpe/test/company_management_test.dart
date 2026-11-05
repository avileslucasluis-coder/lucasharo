import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sistema_tributario_rimpe/screens/companies_screen.dart';
import 'package:sistema_tributario_rimpe/services/company_service.dart';
import 'package:sistema_tributario_rimpe/services/api_client.dart';
import 'package:sistema_tributario_rimpe/services/session_storage.dart';

void main() {
  testWidgets('edita empresa y exige RUC exacto antes de eliminar en móvil', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    SharedPreferences.setMockInitialValues({});
    var company = <String, dynamic>{'id': 'empresa', 'ruc': '0912345678001', 'razonSocial': 'Original', 'regimen': 'GENERAL', 'miRol': 'ADMIN_EMPRESA'};
    var deleted = false;
    var edits = 0;
    final api = ApiClient(SessionStorage(), onSesionInvalida: () {}, httpClient: MockClient((request) async {
      Object data;
      if (request.method == 'GET') {
        data = deleted ? [] : [company];
      } else if (request.url.path.endsWith('/editar')) {
        edits++;
        company = {...company, ...jsonDecode(request.body) as Map<String, dynamic>};
        data = company;
      } else {
        expect(request.url.path, '/api/companies/empresa/eliminar');
        expect(jsonDecode(request.body), {'confirmarRuc': '0912345678001'});
        deleted = true;
        data = {'eliminado': true};
      }
      return http.Response(jsonEncode(data), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    }));
    addTearDown(api.close);
    await tester.pumpWidget(MaterialApp(home: CompaniesScreen(companies: CompanyService(api))));
    await tester.pumpAndSettle();
    expect(find.text('Descargar todos los datos'), findsOneWidget);
    await tester.tap(find.text('Editar datos'));
    await tester.pumpAndSettle();
    expect(find.text('Original'), findsWidgets);
    await tester.enterText(find.byType(TextFormField).at(1), 'Empresa corregida');
    await tester.drag(find.byType(ListView).last, const Offset(0, -650));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Guardar cambios'));
    await tester.pumpAndSettle();
    expect(edits, 1);
    expect(company['razonSocial'], 'Empresa corregida');
    await tester.tap(find.text('Eliminar empresa'));
    await tester.pumpAndSettle();
    final button = find.widgetWithText(FilledButton, 'Eliminar definitivamente');
    expect(tester.widget<FilledButton>(button).onPressed, isNull);
    await tester.enterText(find.byType(TextField), '0912345678002');
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(button).onPressed, isNull);
    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();
    expect(deleted, isFalse);
    await tester.tap(find.text('Eliminar empresa'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '0912345678001');
    await tester.pumpAndSettle();
    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(deleted, isTrue);
    expect(find.text('Empresa corregida'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
