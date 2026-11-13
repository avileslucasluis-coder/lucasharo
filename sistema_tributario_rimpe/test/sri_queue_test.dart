import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sistema_tributario_rimpe/screens/xml_import_screen.dart';
import 'package:sistema_tributario_rimpe/screens/tax_ledger_screen.dart';
import 'package:sistema_tributario_rimpe/services/api_client.dart';
import 'package:sistema_tributario_rimpe/services/company_service.dart';
import 'package:sistema_tributario_rimpe/services/session_storage.dart';
import 'package:sistema_tributario_rimpe/services/voucher_service.dart';

void main() {
  for (final retenciones in [false, true]) {
    for (final desdeImportar in [true, false]) {
    testWidgets('${desdeImportar ? 'continúa al salir de Importar' : 'retoma al abrir la sección'} y actualiza ${retenciones ? 'Retenciones' : 'Facturas'}', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final first = Completer<void>();
      final called = <String>[];
      final completed = <String>{};
      var pendingCalls = 0;
      final api = ApiClient(SessionStorage(), onSesionInvalida: () {}, httpClient: MockClient((request) async {
        Object data;
        if (request.url.path == '/api/companies') {
          data = [{'id': 'empresa', 'ruc': '0912345678001', 'razonSocial': 'Prueba', 'regimen': 'GENERAL'}];
        } else if (request.url.path.endsWith('/pending-details')) {
          pendingCalls++;
          data = ['uno', 'dos'].where((k) => !completed.contains(k)).map((k) => {'claveAcceso': k}).toList();
        } else if (request.url.path.endsWith('/complete-sri')) {
          final body = jsonDecode(request.body);
          expect(body['companyId'], 'empresa');
          final key = body['claveAcceso'] as String;
          called.add(key);
          if (key == 'uno') await first.future;
          completed.add(key);
          data = {'completado': true};
        } else {
          expect(request.url.path, '/api/vouchers');
          data = ['uno', 'dos'].map((key) => {
            'id': key, 'claveAcceso': key, 'rucEmisor': '0912345678001', 'razonSocialEmisor': 'Prueba $key',
            'tipoComprobante': retenciones ? 'RETENCION' : 'FACTURA',
            'direccion': retenciones ? 'RETENCION_RECIBIDA' : 'COMPRA',
            'fechaEmision': DateTime.now().toIso8601String(),
            'baseImponibleIva': '100', 'baseImponibleIva0': '0', 'montoIva': '15',
            'importeTotal': '115', 'clasificacionPendiente': !completed.contains(key),
            'detalleImpuestos': completed.contains(key) ? [{'grupo': retenciones ? 'RET_IVA' : 'IVA', 'tarifa': '15', 'base': 100, 'valor': 15}] : [],
          }).toList();
        }
        return http.Response(jsonEncode(data), 200);
      }));
      final vouchers = VoucherService(api);
      addTearDown(() { vouchers.dispose(); api.close(); });
      if (desdeImportar) {
        await tester.pumpWidget(MaterialApp(home: XmlImportScreen(companies: CompanyService(api), vouchers: vouchers)));
        await tester.pumpAndSettle();
        final retry = find.text('Completar / reintentar pendientes');
        await tester.ensureVisible(retry);
        await tester.tap(retry);
      } else {
        await tester.pumpWidget(MaterialApp(home: TaxLedgerScreen(companies: CompanyService(api), vouchers: vouchers, retenciones: retenciones)));
      }
      await tester.pump();
      expect(called, ['uno']);
      final sameJob = vouchers.completarPendientes('empresa');
      await tester.pumpWidget(MaterialApp(home: TaxLedgerScreen(companies: CompanyService(api), vouchers: vouchers, retenciones: retenciones)));
      await tester.pump();
      expect(find.textContaining('Carga sus XML'), findsNothing);
      first.complete();
      await tester.pumpAndSettle();
      await sameJob;
      expect(called, ['uno', 'dos']);
      expect(pendingCalls, 1, reason: 'navegar no debe duplicar la cola');
      expect(find.textContaining('Total clasificado'), findsNothing);
      expect(find.textContaining('Pendiente de consulta al SRI'), findsNothing);
      expect(vouchers.estadoSri('empresa')!.completados, 2);
      expect(tester.takeException(), isNull);
    });
    }
  }

  test('no envía más consultas después de cerrar la sesión', () async {
    SharedPreferences.setMockInitialValues({});
    final started = Completer<void>(), release = Completer<void>();
    final calls = <String>[];
    final api = ApiClient(SessionStorage(), onSesionInvalida: () {}, httpClient: MockClient((request) async {
      if (request.url.path.endsWith('/pending-details')) return http.Response('[{"claveAcceso":"uno"},{"claveAcceso":"dos"}]', 200);
      calls.add(jsonDecode(request.body)['claveAcceso']);
      started.complete();
      await release.future;
      return http.Response('{}', 200);
    }));
    final service = VoucherService(api);
    final job = service.completarPendientes('empresa');
    await started.future;
    service.dispose();
    release.complete();
    await job;
    await service.completarPendientes('otra-cuenta');
    expect(calls, ['uno']);
    api.close();
  });

  test('retoma únicamente pendientes guardados al abrir otra sesión y separa empresas', () async {
    SharedPreferences.setMockInitialValues({});
    final queries = <String>[];
    final calls = <String>[];
    final api = ApiClient(SessionStorage(), onSesionInvalida: () {}, httpClient: MockClient((request) async {
      if (request.url.path.endsWith('/pending-details')) {
        final company = request.url.queryParameters['companyId']!;
        queries.add(company);
        return http.Response(jsonEncode([{'claveAcceso': 'pendiente-$company'}]), 200);
      }
      final body = jsonDecode(request.body);
      calls.add('${body['companyId']}:${body['claveAcceso']}');
      return http.Response('{}', 200);
    }));
    final service = VoucherService(api);
    await Future.wait([service.completarPendientes('A'), service.completarPendientes('B')]);
    expect(queries, ['A', 'B']);
    expect(calls, ['A:pendiente-A', 'B:pendiente-B']);
    expect(service.estadoSri('A')!.completados, 1);
    expect(service.estadoSri('B')!.completados, 1);
    service.dispose(); api.close();
  });
}
