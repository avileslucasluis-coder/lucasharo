# Dayanex · Declaraciones

Sistema de declaraciones con interfaz Flutter y API NestJS, Prisma y PostgreSQL. Admite PostgreSQL local o Neon.

## Funciones

- Registro con nombre, cédula/RUC y contraseña de 8 a 10 caracteres; no requiere correo.
- Gestión multiempresa con permisos y sesiones.
- El RUC de una empresa es único dentro de su cuenta propietaria, no en toda la plataforma. Dos cuentas pueden registrar el mismo RUC con empresas y comprobantes independientes. Los permisos siguen comprobándose por el identificador de empresa y la membresía del usuario; coincidir en el RUC nunca concede acceso. La migración conserva las empresas, sus identificadores, movimientos y membresías existentes.
- Administración de empresas: editar datos, descargar un respaldo completo `.json.gz` y eliminar definitivamente con confirmación del RUC. El respaldo contiene XML, declaraciones/versiones, PDF adjuntos en base64, retenciones, ATS, decisiones, auditoría y datos relacionados; no incluye contraseñas ni sesiones de usuarios. La eliminación borra esos datos para todos los usuarios y conserva solo un evento mínimo de eliminación. No cambia el RUC de empresas que ya tienen movimientos.
- Importación de XML y TXT, detección de duplicados y seguimiento de pendientes de detalle.
- Facturas con bases e IVA por tarifa; retenciones de IVA y renta por porcentaje.
- Resúmenes por empresa y período, declaraciones versionadas y exportación CSV.
- Panel mensual adaptable a móvil y escritorio.
- Al subir TXT, consulta de solo lectura al SRI para completar automáticamente los XML y sus tarifas. Incluye avance y reintento de pendientes; mantener abierta la pantalla de importación. No requiere contraseña SRI ni habilita emisión de comprobantes.

## Instalación

Requisitos: Node.js 22, Flutter y PostgreSQL (local o Neon).

1. En `backend`, ejecutar `npm ci` y copiar `.env.example` a `.env`.
2. Configurar `DATABASE_URL` y un `JWT_SECRET` aleatorio de al menos 48 caracteres. Para Neon usar la conexión directa con TLS. Nunca subir las credenciales al repositorio.
3. Ejecutar `npx prisma generate`, `npx prisma migrate deploy`, `node --env-file=.env node_modules/ts-node/dist/bin.js prisma/seed.ts` y `npm run build`.
4. En `sistema_tributario_rimpe`, ejecutar `flutter pub get` y `flutter build web --release`.
5. Copiar el contenido de `sistema_tributario_rimpe/build/web` a `backend/public`, conservando las páginas `recover.html`, `recovery.js` y `recovery.css`.
6. Desde `backend`, ejecutar `node --env-file=.env dist/main.js`. Abrir el puerto definido en `.env` (por defecto 3000).

Los datos y la configuración local no se incluyen en Git. Una instalación nueva requiere su propia configuración de PostgreSQL y credenciales. El registro en producción está deshabilitado por defecto; revisar `ALLOW_PUBLIC_REGISTRATION` según el uso previsto.

## Publicación en Vercel

Configura `backend` como Root Directory y NestJS como framework, sin sobrescribir Output Directory. `backend/public` incluye la interfaz Flutter compilada para que los despliegues desde GitHub publiquen tanto la API como la página inicial. El build verifica sus archivos antes de continuar.

Después de modificar Flutter, ejecuta `flutter build web --release` en `sistema_tributario_rimpe`, copia `build/web` a `backend/public`, reemplaza `backend/public/flutter_service_worker.js` con `sistema_tributario_rimpe/web/retire-worker.js` y añade los cambios a Git. No uses `--dart-define=API_BASE_URL` con una URL local: la versión web utiliza el mismo dominio del despliegue.

## Pruebas

En `backend`: `npm test -- --runInBand` y `npm run build`.
En `sistema_tributario_rimpe`: `flutter test` y `flutter build web --release`.

Los flujos de monitoreo y copias remotas requieren habilitación explícita mediante variables y secretos de GitHub. Subir este repositorio no publica por sí solo la aplicación.

Consulta [LEEME-DECLARACIONES.md](LEEME-DECLARACIONES.md) para detalles y [ejemplos](ejemplos) para TXT sintéticos. Los TXT sin bases por tarifa se completan con el XML consultado automáticamente al SRI; no se deducen tarifas a partir de totales. Si el SRI no responde, el registro permanece pendiente y se puede retomar con «Completar / reintentar pendientes» sin volver a subir el TXT. La consulta usa el ambiente de producción de solo lectura, independientemente de la configuración de emisión.
