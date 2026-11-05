# Dayanex · Declaraciones

Sistema de declaraciones con interfaz Flutter y API NestJS, Prisma y PostgreSQL. Admite PostgreSQL local o Neon.

## Funciones

- Registro con nombre, cédula/RUC y contraseña de 8 a 10 caracteres; no requiere correo.
- Gestión multiempresa con permisos y sesiones.
- Importación de XML y TXT, detección de duplicados y seguimiento de pendientes de detalle.
- Facturas con bases e IVA por tarifa; retenciones de IVA y renta por porcentaje.
- Resúmenes por empresa y período, declaraciones versionadas y exportación CSV.
- Panel mensual adaptable a móvil y escritorio. Sin conexión activa al SRI.

## Instalación

Requisitos: Node.js 22, Flutter y PostgreSQL (local o Neon).

1. En `backend`, ejecutar `npm ci` y copiar `.env.example` a `.env`.
2. Configurar `DATABASE_URL` y un `JWT_SECRET` aleatorio de al menos 48 caracteres. Para Neon usar la conexión directa con TLS. Nunca subir las credenciales al repositorio.
3. Ejecutar `npx prisma generate`, `npx prisma migrate deploy`, `node --env-file=.env node_modules/ts-node/dist/bin.js prisma/seed.ts` y `npm run build`.
4. En `sistema_tributario_rimpe`, ejecutar `flutter pub get` y `flutter build web --release`.
5. Copiar el contenido de `sistema_tributario_rimpe/build/web` a `backend/public`, conservando las páginas `recover.html`, `recovery.js` y `recovery.css`.
6. Desde `backend`, ejecutar `node --env-file=.env dist/main.js`. Abrir el puerto definido en `.env` (por defecto 3000).

Los datos y la configuración local no se incluyen en Git. Una instalación nueva requiere su propia configuración de PostgreSQL y credenciales. El registro en producción está deshabilitado por defecto; revisar `ALLOW_PUBLIC_REGISTRATION` según el uso previsto.

## Pruebas

En `backend`: `npm test -- --runInBand` y `npm run build`.
En `sistema_tributario_rimpe`: `flutter test` y `flutter build web --release`.

Los flujos de monitoreo y copias remotas requieren habilitación explícita mediante variables y secretos de GitHub. Subir este repositorio no publica por sí solo la aplicación.

Consulta [LEEME-DECLARACIONES.md](LEEME-DECLARACIONES.md) para detalles y [ejemplos](ejemplos) para TXT sintéticos. Los TXT sin bases por tarifa se completan con el XML; no se deducen tarifas a partir de totales.
