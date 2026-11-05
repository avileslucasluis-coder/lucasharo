# Dayanex · Declaraciones

## Conexión activa: Neon

Desde el 5 de noviembre de 2026 el servidor usa PostgreSQL de Neon mediante TLS con validación del certificado. Se transfirieron la cuenta existente y los registros de la base local, conservando su contraseña y las sesiones. Se verificaron todas las migraciones sin pendientes ni diferencias. La aplicación sigue abriéndose en http://localhost:8092; conectar Neon no publica la interfaz en Internet.

La conexión activa se guarda en `backend/.env`. El arranque `INICIAR-DECLARACIONES.cmd` detecta Neon y no requiere Docker. Se conservan el contenedor local, la configuración anterior en `backend/.env.before-neon` y una copia cifrada `backend/.cache/antes-neon-1793885356535.enc`. La clave de esa copia es `DATA_ENCRYPTION_KEY` de la configuración anterior; mantenerla privada y separada de la copia al archivarla. No restaurar la base local como activa sin conciliar los cambios nuevos realizados en Neon.

Actualización del 5 de noviembre de 2026: panel con resumen mensual y accesos rápidos; registro con nombre, cédula/RUC y contraseña, sin solicitar correo. Se conservan los correos de cuentas anteriores, pero el acceso visible usa identificación. Las cuentas nuevas sin correo requieren asistencia del administrador para recuperar acceso. La sección y las rutas de conexión al SRI se retiraron del sistema activo; se conserva la importación manual de XML/TXT y la preparación de declaraciones.

Adaptación del proyecto entregado en el ZIP: Flutter web, NestJS y PostgreSQL. El ZIP original no fue modificado. No se copiaron sus credenciales `.env`.

## Funcionalidad

- Acceso mediante cédula; se conserva compatibilidad con RUC y correo de cuentas anteriores. Registro y recuperación exigen entre ocho y diez caracteres. Las claves se guardan con Argon2, con los controles de sesión y limitación de intentos existentes.
- Empresas: se mantiene el registro multiempresa y sus permisos.
- Importación XML y TXT de recibidos o emitidos. Validación por empresa, fecha, clave e importes; duplicados entre archivos omitidos. Los períodos cerrados no admiten cambios.
- Facturas: compras y ventas, filtro de empresa/mes/año, desglose de base e IVA 15 %, 8 %, 5 %, 0 % y no objeto. Se conservan también exento y tarifas históricas cuando aparecen en XML. Las notas de crédito restan.
- Retenciones: IVA 30 %, 70 %, 100 %, 0 %, 10 %, 20 % y 50 %; renta 15 %, 10 %, 5 %, 3 %, 2 %, 1 % y 0 %. Los códigos del SRI se conservan separados de los porcentajes.
- Calculadora de servicios profesionales con la regla solicitada: natural 10 % y sociedad 5 %. Es una simulación; no crea comprobantes ni cambia sus retenciones.
- Declaraciones: desglose por tarifa, base e impuesto, conservado en cada versión. Exportación CSV con separador `;` y coma decimal para configuración regional española. Importes del servidor en Decimal y presentación monetaria en la interfaz.

## TXT admitidos

UTF-8 o Latin-1, encabezado y columnas separadas por tabuladores o punto y coma. Se aceptan encabezados SRI como `RUC_EMISOR`, `RAZON_SOCIAL_EMISOR`, `COMPROBANTE`, `NUMERO_AUTORIZACION`, `FECHA_EMISION`, `IDENTIFICACION_RECEPTOR`, `VALOR_SIN_IMPUESTOS`, `IVA`, `IMPORTE_TOTAL`.

**El listado general del SRI puede no contener las bases por tarifa ni las líneas de retención.** Estos registros se cargan como pendientes, conservando el total informado, y deben completarse subiendo el XML de la misma clave. No se adivina la tarifa a partir de totales. Las declaraciones se bloquean hasta completar los pendientes del período.

Para TXT detallados, ver `ejemplos/`: una fila por tarifa o línea de retención. Las claves de esos archivos son datos sintéticos de prueba, no comprobantes válidos. En un archivo detallado se requieren base, tarifa y valor, incluso para el cero. Los totales calculados corresponden a base e IVA o retenciones; otros cargos, ICE y propinas requieren el XML.

## Configurar y arrancar

En este equipo ya está configurada una base local nueva, migrada y conectada. La aplicación está en **http://localhost:8092**. Para reiniciar: abrir Docker Desktop y ejecutar `INICIAR-DECLARACIONES.cmd`. Registrar tu propia cuenta en la pantalla de acceso; no se creó una cuenta de demostración en esta base.

Requisitos: Node 22, Flutter, PostgreSQL 16 (o Docker Desktop con motor activo).

1. En `backend`, copiar `.env.example` a `.env`. Configurar `DATABASE_URL`, generar un `JWT_SECRET` aleatorio de al menos 48 caracteres y elegir `PORT` y `CORS_ORIGIN`. No reutilizar contraseñas del ejemplo en producción.
2. Para una base local de desarrollo, con Docker activo: `docker compose -p dayanex_declaraciones up -d db`. Ese nombre mantiene un volumen propio; comprobar antes que el puerto 5432 esté libre.
3. En `backend`: `npm ci`, `npx prisma generate`, `npx prisma migrate deploy`, `node --env-file=.env node_modules/ts-node/dist/bin.js prisma/seed.ts`, `npm run build`.
4. En `sistema_tributario_rimpe`: `flutter pub get`, `flutter build web --release`.
5. Copiar el contenido de `sistema_tributario_rimpe/build/web` a `backend/public`, conservando `recover.html`, `recovery.js` y `recovery.css`. La entrega ya incluye una compilación web.
6. En `backend`: `npm run start:prod`. Abrir `http://localhost:3000` (o el puerto elegido), registrar la cuenta y agregar las empresas. En producción el registro público está cerrado por defecto; habilitarlo solo si se desea.

La migración `202611050001_tax_details` agrega detalle de impuestos, origen y estado pendiente a los comprobantes; no elimina registros. Los XML anteriores se desglosan al consultar.

## Gmail para recuperación

En el `.env` del servidor:

```ini
MAIL_PROVIDER=gmail
GMAIL_USER=avileslucasluis@gmail.com
GMAIL_APP_PASSWORD=CONFIGURAR_EN_EL_SERVIDOR
PASSWORD_RESET_URL=https://TU-DOMINIO/recover.html
```

Usar una contraseña de aplicación de Gmail, no la contraseña habitual de la cuenta. Mantenerla fuera del código y del repositorio. El remitente es la cuenta indicada; el destinatario es el correo registrado de cada usuario. Los enlaces caducan en 15 minutos y son de un solo uso. No se ha enviado ningún correo ni configurado una credencial real.

## Verificación y límites

Servidor y Flutter web compilados. Pruebas de importes, tarifas, XML, declaraciones, permisos y navegación móvil/escritorio aprobadas. Además, 262 comprobaciones HTTP con PostgreSQL aislado aprobadas, incluyendo TXT, duplicados, permisos, completar pendientes con XML y declaración por tarifas. Se verificó el acceso en navegador y el servidor informa base conectada. Falta la credencial Gmail para probar el envío real. Esta entrega no publica el servidor en Internet ni presenta declaraciones ante el SRI.

El alojamiento de Sites usa Cloudflare Workers; este proyecto conserva NestJS, PostgreSQL y SMTP de Gmail, por lo que necesita un servidor compatible con Node y PostgreSQL para su publicación.
