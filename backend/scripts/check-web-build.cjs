const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'public');
const required = ['index.html', 'main.dart.js', 'flutter_bootstrap.js', 'flutter.js', 'manifest.json', 'assets/FontManifest.json'];
const missing = required.filter(name => !fs.existsSync(path.join(root, name)));
if (missing.length) {
  console.error('Falta la interfaz Flutter publicada: ' + missing.join(', '));
  console.error('Compila Flutter web, copia build/web a backend/public y añade los archivos a Git antes de desplegar.');
  process.exitCode = 1;
} else console.log('Interfaz Flutter disponible para el despliegue.');
