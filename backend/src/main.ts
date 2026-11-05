import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import helmet from 'helmet';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { validateProduction } from './security/config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  validateProduction(process.env);
  const production = process.env.NODE_ENV === 'production';
  // Trust the single Vercel ingress only when running inside Vercel.
  if (process.env.VERCEL === '1') app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'", 'https://www.gstatic.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        connectSrc: ["'self'", 'https://www.gstatic.com', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"], frameAncestors: ["'none'"],
        upgradeInsecureRequests: production ? [] : null,
      },
    },
    strictTransportSecurity: production ? { maxAge: 31536000 } : false,
    crossOriginEmbedderPolicy: false,
  }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = randomUUID();
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    res.on('finish', () => {
      if (req.path.startsWith('/api/')) console.log(JSON.stringify({
        event: 'http_security', requestId, method: req.method,
        route: req.route?.path ?? 'unmatched', status: res.statusCode,
        at: new Date().toISOString(),
      }));
    });
    if (production && !req.secure) {
      res.status(400).json({ message: 'Se requiere HTTPS.' });
      return;
    }
    next();
  });
  app.useBodyParser('json', { limit: '3mb' });
  app.enableShutdownHooks();
  app.useStaticAssets(join(__dirname, '..', 'public'));

  // Nunca confiar solo en las validaciones del frontend: toda entrada se
  // valida de nuevo aquí antes de llegar a cualquier controller.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()) ?? false,
    credentials: false,
  });

  if (!production) {
  const config = new DocumentBuilder()
    .setTitle('Sistema Tributario RIMPE — API')
    .setDescription(
      'API multiempresa: autenticación, RBAC, motor de obligaciones tributarias, comprobantes, retenciones, declaraciones y ATS.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API escuchando en http://localhost:${port} — docs en /docs`);
}
bootstrap().catch((error) => {
  console.error('No se pudo iniciar la API:', error.message);
  process.exitCode = 1;
});
