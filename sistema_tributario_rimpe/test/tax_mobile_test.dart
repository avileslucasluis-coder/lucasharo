import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sistema_tributario_rimpe/screens/ats_review_screen.dart';
import 'package:sistema_tributario_rimpe/screens/filings_screen.dart';
import 'package:sistema_tributario_rimpe/screens/tax_adjustments_screen.dart';
import 'package:sistema_tributario_rimpe/services/api_client.dart';
import 'package:sistema_tributario_rimpe/services/session_storage.dart';

void main() {
  for (final width in [360.0, 390.0]) {
    testWidgets('formularios tributarios y revisión ATS en $width px', (tester) async {
      tester.view.physicalSize = Size(width, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      SharedPreferences.setMockInitialValues({});
      final api = ApiClient(SessionStorage(), onSesionInvalida: () {}, httpClient: MockClient((request) async => http.Response(jsonEncode(request.url.path.endsWith('/review') ? [
        {'id':'voucher','direccion':'COMPRA','tipoComprobante':'FACTURA','identificacionContraparte':'0999999999001','fechaEmision':'2026-09-15T00:00:00.000Z'},
      ] : []), 200)));
      addTearDown(api.close);
      for (final annual in [false,true]) {
        await tester.pumpWidget(MaterialApp(home: TaxAdjustmentsScreen(annual: annual, regimen: 'GENERAL')));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(MaterialApp(home: FilingsScreen(api: api, companyId: 'company', declarationId: 'declaration', revision: 1, annual: annual)));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      }
      await tester.pumpWidget(MaterialApp(home: AtsReviewScreen(api: api, companyId: 'company', mes: 10, anio: 2026)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('COMPRA · FACTURA'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Fecha de registro contable'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
