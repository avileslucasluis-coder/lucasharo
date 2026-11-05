import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sistema_tributario_rimpe/screens/declaraciones_screen.dart';
import 'package:sistema_tributario_rimpe/services/api_client.dart';
import 'package:sistema_tributario_rimpe/services/session_storage.dart';
import 'package:sistema_tributario_rimpe/services/company_service.dart';
import 'package:sistema_tributario_rimpe/services/declaration_api_service.dart';
import 'package:sistema_tributario_rimpe/services/ats_api_service.dart';

void main() {
  testWidgets('los saldos propuestos requieren confirmación y no se guardan automáticamente', (tester) async {
    await tester.binding.setSurfaceSize(const Size(1200, 1600));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    SharedPreferences.setMockInitialValues({});
    final requests = <http.Request>[];
    final api = ApiClient(SessionStorage(), onSesionInvalida: () {}, httpClient: MockClient((request) async {
      requests.add(request);
      final Object data;
      if (request.url.path == '/api/companies') {
        data = [{'id': 'company', 'ruc': '1790012345001', 'razonSocial': 'Empresa', 'regimen': 'GENERAL'}];
      } else if (request.url.path.endsWith('/history')) {
        data = [{'snapshot': {'ajustes': {'factorCredito': '0.5', 'justificacion': 'Conciliación guardada anteriormente'}}}];
      } else {
        data = {'mes': 10, 'anio': 2026, 'revision': 2, 'respaldo': '123', 'aviso': 'Compara con el SRI',
          'creditoAnteriorCompras': '93.24', 'creditoAnteriorRetenciones': '707.62'};
      }
      return http.Response(jsonEncode(data), 200, headers: {'content-type': 'application/json; charset=utf-8'});
    }));
    addTearDown(api.close);
    await tester.pumpWidget(MaterialApp(home: DeclaracionesScreen(companies: CompanyService(api),
      declarations: DeclarationApiService(api), ats: AtsApiService(api))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Revisar saldos del período anterior'));
    await tester.pumpAndSettle();
    expect(find.text('Revisar saldos anteriores'), findsOneWidget);
    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();
    expect(find.text('Conciliación de IVA y retenciones'), findsNothing);
    await tester.tap(find.text('Revisar saldos del período anterior'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Coinciden con mi declaración'));
    await tester.pumpAndSettle();
    expect(find.text('707.62'), findsOneWidget);
    expect(find.text('93.24'), findsOneWidget);
    expect(find.text('0.5'), findsOneWidget);
    expect(requests.every((r) => r.method == 'GET'), isTrue);
  });
  for (final semestral in [false, true]) {
  testWidgets('consulta historial ${semestral ? 'semestral' : 'mensual'} sin regenerar la declaración', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final requests = <http.Request>[];
    final api = ApiClient(SessionStorage(), onSesionInvalida: () {},
      httpClient: MockClient((request) async {
        requests.add(request);
        return http.Response(jsonEncode(request.url.path == '/api/companies'
          ? [{'id': 'company', 'ruc': '1790012345001', 'razonSocial': 'Empresa', 'regimen': 'GENERAL'}]
          : [{'version': 1, 'action': 'GENERAR_BORRADOR', 'createdAt': '2026-10-30T12:00:00Z',
              'snapshot': {'estado': 'BORRADOR', 'totalIvaVentas': '15.00'}}]), 200);
      }));
    addTearDown(api.close);
    await tester.pumpWidget(MaterialApp(home: DeclaracionesScreen(
      companies: CompanyService(api), declarations: DeclarationApiService(api), ats: AtsApiService(api))));
    await tester.pumpAndSettle();
    if (semestral) {
      await tester.tap(find.text('Mensual'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Semestral').last);
      await tester.pumpAndSettle();
    }
    await tester.tap(find.text('Ver historial del período'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Versión 1'), findsOneWidget);
    await tester.tap(find.textContaining('Versión 1'));
    await tester.pumpAndSettle();
    expect(find.text('15.00'), findsOneWidget);
    expect(requests.every((r) => r.method == 'GET'), isTrue);
    expect(requests.last.url.queryParameters['companyId'], 'company');
    expect(requests.last.url.queryParameters['periodicidad'], semestral ? 'SEMESTRAL' : 'MENSUAL');
    if (semestral) expect(['6', '12'], contains(requests.last.url.queryParameters['mes']));
  });
  }
}
