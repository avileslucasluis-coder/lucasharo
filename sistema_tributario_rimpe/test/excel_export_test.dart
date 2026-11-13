import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
// ignore: depend_on_referenced_packages
import 'package:share_plus_platform_interface/share_plus_platform_interface.dart';
import 'package:sistema_tributario_rimpe/screens/excel_export_screen.dart';
import 'package:sistema_tributario_rimpe/services/api_client.dart';
import 'package:sistema_tributario_rimpe/services/company_service.dart';
import 'package:sistema_tributario_rimpe/services/session_storage.dart';
import 'package:sistema_tributario_rimpe/services/voucher_service.dart';

class TestShare extends SharePlatform {
  final files = <String>[];
  @override
  Future<ShareResult> shareXFiles(List<XFile> values, {String? subject, String? text, Rect? sharePositionOrigin, List<String>? fileNameOverrides}) async {
    expect(await values.single.readAsBytes(), utf8.encode('PK-test-xlsx'));
    files.add(fileNameOverrides!.single);
    return const ShareResult('saved', ShareResultStatus.success);
  }
}

void main() {
  for (final width in [390.0, 1366.0]) {
    testWidgets('descarga mensual/anual y maneja errores en $width px', (tester) async {
      tester.view.physicalSize = Size(width, 900); tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize); addTearDown(tester.view.resetDevicePixelRatio);
      SharedPreferences.setMockInitialValues({});
      final original = SharePlatform.instance, share = TestShare();
      SharePlatform.instance = share;
      addTearDown(() => SharePlatform.instance = original);
      final queries = <Map<String, String>>[];
      var fail = false;
      final api = ApiClient(SessionStorage(), onSesionInvalida: () {}, httpClient: MockClient((request) async {
        if (request.url.path == '/api/companies') return http.Response(jsonEncode([{'id': 'empresa', 'ruc': '0912345678001', 'razonSocial': 'Prueba', 'regimen': 'GENERAL'}]), 200);
        expect(request.url.path, '/api/vouchers/export-excel');
        queries.add(request.url.queryParameters);
        if (fail) return http.Response('{"message":"No tienes acceso a esta empresa."}', 403);
        return http.Response(jsonEncode({'filename': 'consolidado.xlsx', 'mimeType': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'contentBase64': base64Encode(utf8.encode('PK-test-xlsx')), 'comprobantes': 3, 'pendientes': 1}), 200);
      }));
      final vouchers = VoucherService(api);
      addTearDown(() { vouchers.dispose(); api.close(); });
      await tester.pumpWidget(MaterialApp(home: ExcelExportScreen(companies: CompanyService(api), vouchers: vouchers)));
      await tester.pumpAndSettle();
      final download = find.text('Descargar Excel (.xlsx)');
      await tester.ensureVisible(download); await tester.tap(download); await tester.pumpAndSettle();
      expect(queries.single, {'companyId':'empresa', 'anio':'${DateTime.now().year}', 'mes':'${DateTime.now().month}'});
      expect(share.files, ['consolidado.xlsx']);
      await tester.drag(find.byType(ListView), const Offset(0,700)); await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Anual')); await tester.pumpAndSettle();
      await tester.tap(find.text('Anual')); await tester.pumpAndSettle();
      expect(find.text('Mes'), findsNothing);
      await tester.ensureVisible(download); await tester.tap(download); await tester.pumpAndSettle();
      expect(queries.last, {'companyId':'empresa', 'anio':'${DateTime.now().year}'});
      expect(share.files.length, 2);
      fail = true;
      await tester.tap(download); await tester.pumpAndSettle();
      await tester.drag(find.byType(ListView), const Offset(0,-700)); await tester.pumpAndSettle();
      expect(find.text('No tienes acceso a esta empresa.'), findsOneWidget);
      expect(share.files.length, 2);
      expect(tester.takeException(), isNull);
    });
  }
}
