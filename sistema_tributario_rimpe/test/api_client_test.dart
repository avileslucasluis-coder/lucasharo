import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sistema_tributario_rimpe/services/api_client.dart';
import 'package:sistema_tributario_rimpe/services/api_exception.dart';
import 'package:sistema_tributario_rimpe/services/session_storage.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late SessionStorage session;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    session = SessionStorage();
    await session.guardar(accessToken: 'viejo', refreshToken: 'refresh-viejo');
  });

  test('varias peticiones renuevan la sesión una sola vez', () async {
    var renovaciones = 0;
    var invalidaciones = 0;
    final liberarRefresh = Completer<void>();
    final inicioRefresh = Completer<void>();
    final client = ApiClient(session, onSesionInvalida: () { invalidaciones++; },
      httpClient: MockClient((request) async {
        if (request.url.path == '/api/auth/refresh') {
          renovaciones++;
          inicioRefresh.complete();
          await liberarRefresh.future;
          return http.Response(jsonEncode({'accessToken': 'nuevo', 'refreshToken': 'refresh-nuevo'}), 201);
        }
        if (request.headers['Authorization'] == 'Bearer nuevo') {
          return http.Response('[]', 200);
        }
        return http.Response('{"message":"Unauthorized"}', 401);
      }));
    addTearDown(client.close);
    final peticiones = Future.wait(List.generate(4, (_) => client.get('/api/companies')));
    await inicioRefresh.future;
    await Future<void>.delayed(const Duration(milliseconds: 10));
    liberarRefresh.complete();
    expect(await peticiones, [[], [], [], []]);
    expect(renovaciones, 1);
    expect(invalidaciones, 0);
    expect(await session.accessToken, 'nuevo');
  });

  test('un fallo de red se muestra como ApiException', () async {
    final client = ApiClient(session, onSesionInvalida: () {},
      httpClient: MockClient((_) async => throw http.ClientException('sin red')));
    addTearDown(client.close);
    await expectLater(client.get('/api/companies'), throwsA(isA<ApiException>()));
  });

  test('un fallo de red al renovar conserva la sesión para reintentar', () async {
    var invalidada = false;
    final client = ApiClient(session, onSesionInvalida: () { invalidada = true; },
      httpClient: MockClient((request) async {
        if (request.url.path == '/api/auth/refresh') throw http.ClientException('sin red');
        return http.Response('{}', 401);
      }));
    addTearDown(client.close);
    await expectLater(client.get('/api/companies'), throwsA(isA<ApiException>()));
    expect(invalidada, isFalse);
    expect(await session.accessToken, 'viejo');
  });

  test('un refresh revocado borra la sesión antes de notificar', () async {
    final client = ApiClient(session, onSesionInvalida: session.limpiar,
      httpClient: MockClient((_) async => http.Response('{}', 401)));
    addTearDown(client.close);
    await expectLater(client.get('/api/companies'), throwsA(isA<ApiException>()));
    expect(await session.accessToken, isNull);
    expect(await session.refreshToken, isNull);
  });

  test('las peticiones tienen un tiempo máximo de espera', () async {
    final client = ApiClient(session, onSesionInvalida: () {},
      requestTimeout: const Duration(milliseconds: 5),
      httpClient: MockClient((_) => Completer<http.Response>().future));
    addTearDown(client.close);
    await expectLater(client.get('/api/companies'), throwsA(isA<ApiException>()));
  });
}
