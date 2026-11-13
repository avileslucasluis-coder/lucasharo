import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sistema_tributario_rimpe/main.dart';
import 'package:sistema_tributario_rimpe/services/api_client.dart';
import 'package:sistema_tributario_rimpe/services/auth_service.dart';
import 'package:sistema_tributario_rimpe/services/session_storage.dart';
import 'package:sistema_tributario_rimpe/utils/app_theme.dart';

class _AuthPrueba implements AuthService {
  @override
  bool platformAdmin = false;
  @override
  final ApiClient api;
  _AuthPrueba(this.api);

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

void main() {
  for (final size in [const Size(390, 844), const Size(1366, 900)]) {
    testWidgets('navegación sin empresas en ${size.width.toInt()} px', (tester) async {
      SharedPreferences.setMockInitialValues({});
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = ApiClient(SessionStorage(), onSesionInvalida: () {},
        httpClient: MockClient((_) async => http.Response('[]', 200)));
      addTearDown(api.close);
      await tester.pumpWidget(MaterialApp(theme: AppTheme.theme,
        home: RootShell(auth: _AuthPrueba(api))));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);

      for (final destino in ['Empresas', 'Facturas', 'Importar XML / TXT', 'Retenciones', 'Exportar Excel', 'Declaraciones', 'Obligaciones', 'Panel']) {
        if (size.width < 900) {
          await tester.tap(find.byTooltip('Menú principal'));
          await tester.pumpAndSettle();
        }
        final target = size.width < 900 ? find.descendant(of: find.byType(Drawer), matching: find.text(destino)) : find.text(destino).first;
        await tester.ensureVisible(target);
        await tester.tap(target);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: destino);
        expect(find.byType(CircularProgressIndicator), findsNothing, reason: destino);
      }
    });
  }
}
