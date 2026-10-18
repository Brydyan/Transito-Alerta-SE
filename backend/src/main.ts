import * as Sentry from '@sentry/node';
import { NestFactory } from '@nestjs/core';
import { LogLevel, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { SnakeCaseResponseInterceptor } from './shared/interceptors/snake-case-response.interceptor';
import { RequestIdLogger } from './shared/observability/request-id.logger';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter';
import { isTrustedProxyAddress } from './shared/proxy-trust';

async function bootstrap(): Promise<void> {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    });
  }

  // `LOG_LEVEL` explícito, NO inferido de `NODE_ENV`. Los contenedores de
  // staging corren con `NODE_ENV=production` igual que los de producción, así
  // que inferirlo callaría los logs justo en el entorno donde se depura.
  //
  // Formato: lista separada por comas, en orden de severidad decreciente.
  //   staging     LOG_LEVEL=error,warn,log,debug,verbose
  //   producción  LOG_LEVEL=error,warn,log
  //
  // El default es el conservador: sin la variable, no se emite `debug` ni
  // `verbose`. Un entorno que nadie configuró no debería ser el más ruidoso.
  const DEFAULT_LOG_LEVELS: LogLevel[] = ['error', 'warn', 'log'];
  const logLevels = process.env.LOG_LEVEL
    ? (process.env.LOG_LEVEL.split(',')
        .map((l) => l.trim())
        .filter(Boolean) as LogLevel[])
    : DEFAULT_LOG_LEVELS;

  // Una instancia de logger en vez de la lista de niveles a secas: es lo
  // que ata cada línea a su petición (`[req=…]`, ver RequestIdLogger).
  // Los niveles se le pasan igual — la variable LOG_LEVEL manda lo mismo
  // que antes.
  const logger = new RequestIdLogger();
  logger.setLogLevels(logLevels);

  const app = await NestFactory.create(AppModule, { logger });

  // MAIL G.1 (sc-330, D10) — confianza en el proxy acotada
  // por DIRECCIÓN, no por número de saltos. La función
  // está extraída a `common/proxy-trust.ts` para que G.2/G.3
  // puedan probarla en aislamiento.
  // `app.set` no existe en `INestApplication`; accedemos a
  // la instancia de Express subyacente vía el adapter HTTP.
  // `set('trust proxy', fn)` es exactamente el setting de
  // Express, no un wrapper de Nest.
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set(
    'trust proxy',
    isTrustedProxyAddress,
  );

  // Design D5 — socket.io Redis adapter for cross-instance room broadcast.
  app.useWebSocketAdapter(new RedisIoAdapter(app));

  // T4.3a — HTTP security headers (X-Frame-Options, X-Content-Type-Options,
  // Strict-Transport-Security, etc.) on every response, including CORS.
  // P17 (MINIMAX_BUILDER_SECURITY_IMPLEMENTATION.md) — expandido:
  // - CSP: whitelist sources (Angular requiere unsafe-inline para
  //   script-src y style-src). data: para imágenes (incident photos).
  //   connect-src self+wss para sockets.
  // - HSTS: 1 año, includeSubDomains, preload-eligible.
  // - Referrer-Policy: strict-origin-when-cross-origin (no leak de
  //   path completo a terceros).
  // - crossOriginResourcePolicy: false (mantenido — los assets del
  //   backend son JSON, no se sirven a otros orígenes).
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: [`'self'`],
        scriptSrc: [`'self'`, `'unsafe-inline'`],
        styleSrc: [`'self'`, `'unsafe-inline'`],
        imgSrc: [`'self'`, 'data:', 'https:'],
        connectSrc: [`'self'`, 'wss:', 'https:'],
        objectSrc: [`'none'`],
        frameAncestors: [`'none'`],
      },
    },
    strictTransportSecurity: {
      maxAge: 31_536_000, // 1 año
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginResourcePolicy: false,
  }));

  app.setGlobalPrefix('api');
  // 2026-10-18 — security (P8, MINIMAX_BUILDER_SECURITY_IMPLEMENTATION).
  // El código previo hacía `origin: process.env.CORS_ORIGIN?.split(',') ?? true`
  // — fallback a `true` (wildcard) si la env no estaba seteada. Eso significa
  // que cualquier origen podía hacer cross-origin reads al API. En un sistema
  // con JWT bearer tokens esto es vector de fuga de tokens vía XSS en un
  // sitio malicioso.
  //
  // Cambio: la whitelist ahora vive en `CORS_ALLOWED_ORIGINS` (CSV). Si está
  // vacía, CORS se cierra por completo (origin=false). En producción, una
  // whitelist vacía es un error de boot (no arrancamos con la API abierta).
  // En dev, una whitelist vacía es seguro (las pruebas e2e del repo NO
  // dependen del header CORS — Supertest no valida CORS, y los e2e con
  // browser son contra el front propio con origin whitelisted).
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!allowedOrigins.length && process.env.NODE_ENV === 'production') {
    throw new Error(
      'CORS_ALLOWED_ORIGINS must be set (comma-separated list) in production',
    );
  }

  app.enableCors({
    origin: allowedOrigins.length ? allowedOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Request DTOs are snake_case throughout; this makes responses match, so a
  // client never sends `incident_id` and receives `incidentId` back.
  app.useGlobalInterceptors(new SnakeCaseResponseInterceptor());

  // T4.4a — Swagger UI at /api/docs. Active in `development` only:
  //   - production: hide (attack surface + internal contract leak)
  //   - test:       hide (e2e harness mirrors main.ts but does not need it)
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Transito Alerta SE — API')
      .setDescription('Backend NestJS — migración GeoReporta')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Transito Alerta API listening on :${port}/api`);
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start Transito Alerta API', error);
  process.exit(1);
});
