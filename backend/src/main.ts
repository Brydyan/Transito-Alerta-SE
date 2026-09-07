import * as Sentry from '@sentry/node';
import { NestFactory } from '@nestjs/core';
import { LogLevel, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { SnakeCaseResponseInterceptor } from './common/interceptors/snake-case-response.interceptor';
import { RequestIdLogger } from './common/observability/request-id.logger';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter';
import { isTrustedProxyAddress } from './common/proxy-trust';

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
  app.use(helmet({
    crossOriginResourcePolicy: false,
  }));

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
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
