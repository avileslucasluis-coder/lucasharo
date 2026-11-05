import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sistema_tributario_rimpe/screens/admin_screen.dart';
import 'package:sistema_tributario_rimpe/services/api_client.dart';
import 'package:sistema_tributario_rimpe/services/session_storage.dart';

void main() {
  testWidgets('el administrador agrega identificación y corrige nombre de otra cuenta', (tester) async {
    SharedPreferences.setMockInitialValues({});
    Map<String, dynamic>? submitted;
    final api = ApiClient(SessionStorage(), onSesionInvalida: () {}, httpClient: MockClient((request) async {
      Object data;
      if (request.method == 'POST') {
        expect(request.url.path, '/api/admin/users/target/profile');
        submitted = jsonDecode(request.body) as Map<String, dynamic>;
        data = submitted!;
      } else if (request.url.path.endsWith('/status')) {
        data = {'currentUserId': 'admin', 'mailConfigured': true};
      } else {
        data = [{'id': 'target', 'nombre': submitted?['nombre'] ?? 'Usuario', 'ruc': submitted?['ruc'],
          'email': 'usuario@example.com', 'activo': true, 'platformAdmin': false}];
      }
      return http.Response(jsonEncode(data), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    }));
    addTearDown(api.close);
    await tester.pumpWidget(MaterialApp(home: AdminScreen(api: api)));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Administrar cuenta'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Editar nombre y cédula / RUC'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Guardar cambios'));
    await tester.pumpAndSettle();
    expect(submitted, isNull);
    expect(find.text('Ingresa 10 o 13 dígitos.'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField).at(0), 'Nombre corregido');
    await tester.enterText(find.byType(TextFormField).at(1), '0915926224');
    await tester.tap(find.text('Guardar cambios'));
    await tester.pumpAndSettle();
    expect(submitted, {'nombre': 'Nombre corregido', 'ruc': '0915926224'});
    expect(find.text('Nombre corregido'), findsOneWidget);
  });
}
