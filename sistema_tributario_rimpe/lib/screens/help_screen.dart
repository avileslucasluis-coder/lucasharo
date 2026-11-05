import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Ayuda y privacidad')),
    body: ListView(padding: const EdgeInsets.all(24), children: [
      const Text('Sistema Tributario', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
      const Text('Responsable y soporte: Luis Aviles Lucas'),
      const SelectableText('avileslucasluis@gmail.com'),
      Align(alignment: Alignment.centerLeft, child: TextButton.icon(icon: const Icon(Icons.copy), label: const Text('Copiar correo de soporte'), onPressed: () async {
        await Clipboard.setData(const ClipboardData(text: 'avileslucasluis@gmail.com'));
        if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Correo copiado.')));
      })),
      const Text('Para reportar un problema, indica el módulo, fecha, pasos y mensaje de error. Oculta cédulas, RUC y datos de terceros en las capturas. Nunca envíes contraseñas, conexiones de base de datos ni códigos de recuperación.'),
      const SizedBox(height: 20),
      const Text('Cómo preparar un período', style: TextStyle(fontWeight: FontWeight.bold)),
      const Text('1. Revisa el RUC y el perfil tributario de la empresa.\n2. Importa sus comprobantes XML.\n3. Confirma el período y los saldos iniciales en Declaraciones.\n4. Genera el papel de trabajo y revisa el detalle por comprobante.\n5. Completa la revisión y operaciones especiales del ATS si corresponde.\n6. Compara los resultados con tus respaldos y la declaración oficial.\n7. Revisa, aprueba y cierra el período. Registra por separado la presentación realizada en SRI en Línea.'),
      const SizedBox(height: 20),
      const Text('Información sobre los datos', style: TextStyle(fontWeight: FontWeight.bold)),
      const Text('El sistema trata nombre, correo, cédula o RUC, datos de empresas, comprobantes, conciliaciones y registros de actividad para gestionar cuentas y preparar papeles de trabajo. Los datos proceden de los usuarios y documentos que importan. Una identificación incorrecta puede impedir el acceso o vincular información equivocada.'),
      const SizedBox(height: 12),
      const Text('La infraestructura utiliza Vercel y Neon; el correo de recuperación se envía mediante el proveedor configurado por el responsable. Estos servicios pueden procesar información fuera de Ecuador. El acceso se limita según los permisos de la cuenta. Las contraseñas se almacenan mediante hash; esto no significa que toda la base de datos esté cifrada campo por campo.'),
      const SizedBox(height: 12),
      const Text('Puedes solicitar información, acceso, corrección, eliminación o portabilidad escribiendo al contacto de soporte. Se verificará tu identidad y la procedencia de la solicitud; pueden existir obligaciones de conservación de documentos tributarios. También puedes consultar a la Superintendencia de Protección de Datos Personales en spdp.gob.ec.'),
      const SizedBox(height: 12),
      const Text('El responsable debe completar los plazos de conservación, la base jurídica y los datos de contacto legal antes de considerar definitivo el aviso de privacidad. Esta información describe el funcionamiento actual; no acredita una auditoría legal.'),
      const SizedBox(height: 20),
      const Text('Alcance del servicio', style: TextStyle(fontWeight: FontWeight.bold)),
      const Text('El papel de trabajo y su aprobación interna no presentan declaraciones ni certifican aceptación por el SRI. La revisión tributaria profesional y la presentación oficial son pasos separados. No compartas tu cuenta; cierra la sesión al terminar en un equipo ajeno.'),
    ]),
  );
}
