import 'package:flutter/material.dart';
import 'screens/help_screen.dart';
import 'utils/app_theme.dart';
import 'services/auth_service.dart';
import 'services/company_service.dart';
import 'services/voucher_service.dart';
import 'services/declaration_api_service.dart';
import 'services/tax_obligations_service.dart';
import 'services/ats_api_service.dart';
import 'screens/login_screen.dart';
import 'screens/complete_identity_screen.dart';
import 'screens/admin_screen.dart';
import 'screens/workspace_dashboard.dart';
import 'screens/companies_screen.dart';
import 'screens/xml_import_screen.dart';
import 'screens/tax_ledger_screen.dart';
import 'screens/declaraciones_screen.dart';
import 'screens/obligaciones_screen.dart';

void main() {
  runApp(const SistemaTributarioApp());
}

class SistemaTributarioApp extends StatefulWidget {
  const SistemaTributarioApp({super.key});

  @override
  State<SistemaTributarioApp> createState() => _SistemaTributarioAppState();
}

class _SistemaTributarioAppState extends State<SistemaTributarioApp> {
  late final AuthService _auth;

  @override
  void initState() {
    super.initState();
    _auth = AuthService()..addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _auth.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Sistema Tributario RIMPE',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.theme,
      home: switch (_auth.estado) {
        EstadoSesion.cargando => const _PantallaCarga(),
        EstadoSesion.noAutenticado => LoginScreen(auth: _auth),
        EstadoSesion.completarIdentificacion => CompleteIdentityScreen(auth: _auth),
        EstadoSesion.autenticado => RootShell(auth: _auth),
      },
    );
  }
}

class _PantallaCarga extends StatelessWidget {
  const _PantallaCarga();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}

/// Shell principal de navegación, ya conectado a la API. Instancia los
/// servicios de dominio una sola vez (todos comparten el mismo ApiClient
/// autenticado de [auth]) y los pasa a cada pantalla.
class RootShell extends StatefulWidget {
  final AuthService auth;
  const RootShell({super.key, required this.auth});

  @override
  State<RootShell> createState() => _RootShellState();
}

class _RootShellState extends State<RootShell> {
  int _index = 0;

  late final CompanyService _companies = CompanyService(widget.auth.api);
  late final VoucherService _vouchers = VoucherService(widget.auth.api);
  late final DeclarationApiService _declarations = DeclarationApiService(widget.auth.api);
  late final TaxObligationsService _obligations = TaxObligationsService(widget.auth.api);
  late final AtsApiService _ats = AtsApiService(widget.auth.api);

  List<_Destino> get _destinos => [
    if (widget.auth.platformAdmin) const _Destino('Administración', Icons.admin_panel_settings_outlined, Icons.admin_panel_settings),
    const _Destino('Panel', Icons.dashboard_outlined, Icons.dashboard),
    const _Destino('Empresas', Icons.domain_outlined, Icons.domain),
    const _Destino('Facturas', Icons.description_outlined, Icons.description),
    const _Destino('Importar XML / TXT', Icons.upload_file_outlined, Icons.upload_file),
    const _Destino('Retenciones', Icons.receipt_long_outlined, Icons.receipt_long),
    const _Destino('Declaraciones', Icons.fact_check_outlined, Icons.fact_check),
    const _Destino('Obligaciones', Icons.rule_folder_outlined, Icons.rule_folder),
    const _Destino('Ayuda', Icons.help_outline, Icons.help),
  ];

  List<Widget> get _paginas => [
        if (widget.auth.platformAdmin) AdminScreen(api: widget.auth.api),
        DashboardScreen(companies: _companies, vouchers: _vouchers, onNavigate: (label) { final i = _destinos.indexWhere((d) => d.label == label); if (i >= 0) setState(() => _index = i); }),
        CompaniesScreen(companies: _companies),
        TaxLedgerScreen(companies: _companies, vouchers: _vouchers),
        XmlImportScreen(companies: _companies, vouchers: _vouchers),
        TaxLedgerScreen(companies: _companies, vouchers: _vouchers, retenciones: true),
        DeclaracionesScreen(companies: _companies, declarations: _declarations, ats: _ats),
        ObligacionesScreen(companies: _companies, obligations: _obligations),
        const HelpScreen(),
      ];

  Future<void> _cerrarSesion() async {
    _vouchers.dispose();
    await widget.auth.logout();
  }

  @override
  void dispose() {
    _vouchers.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final anchoAmplio = MediaQuery.of(context).size.width >= 900;
    final paginas = _paginas;

    if (anchoAmplio) {
      return Scaffold(
        body: Row(
          children: [
            NavigationRail(
              selectedIndex: _index,
              onDestinationSelected: (i) => setState(() => _index = i),
              extended: MediaQuery.of(context).size.width >= 1200,
              backgroundColor: AppTheme.primary,
              selectedIconTheme: const IconThemeData(color: Colors.white),
              unselectedIconTheme: IconThemeData(color: Colors.white.withOpacity(0.6)),
              selectedLabelTextStyle: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
              unselectedLabelTextStyle: TextStyle(color: Colors.white.withOpacity(0.6)),
              leading: Padding(
                padding: const EdgeInsets.symmetric(vertical: 20),
                child: Image.asset('assets/branding/logo.png', width: 48, height: 48, semanticLabel: 'Sistema Tributario'),
              ),
              trailing: Expanded(
                child: Align(
                  alignment: Alignment.bottomCenter,
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: IconButton(
                      icon: const Icon(Icons.logout, color: Colors.white),
                      tooltip: 'Cerrar sesión',
                      onPressed: _cerrarSesion,
                    ),
                  ),
                ),
              ),
              destinations: _destinos
                  .map((d) => NavigationRailDestination(icon: Icon(d.icon), selectedIcon: Icon(d.iconActivo), label: Text(d.label)))
                  .toList(),
            ),
            const VerticalDivider(width: 1),
            Expanded(child: paginas[_index]),
          ],
        ),
      );
    }

    return Scaffold(
      body: paginas[_index],
      appBar: AppBar(title: const Text('Dayanex · Declaraciones'), leading: Builder(builder: (context) => IconButton(
        tooltip: 'Menú principal', icon: const Icon(Icons.menu), onPressed: () => Scaffold.of(context).openDrawer()))),
      drawer: Drawer(child: SafeArea(child: ListView(children: [
        const DrawerHeader(child: Text('Dayanex · Sistema tributario')),
        ..._destinos.asMap().entries.map((e) => ListTile(leading: Icon(e.value.icon), title: Text(e.value.label), selected: _index == e.key,
          onTap: () { setState(() => _index = e.key); Navigator.pop(context); })),
      ]))),
      floatingActionButton: FloatingActionButton.small(
        onPressed: _cerrarSesion,
        backgroundColor: Colors.grey.shade200,
        child: Icon(Icons.logout, color: Colors.grey.shade800),
      ),
    );
  }
}

class _Destino {
  final String label;
  final IconData icon;
  final IconData iconActivo;
  const _Destino(this.label, this.icon, this.iconActivo);
}
