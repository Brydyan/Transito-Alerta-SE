import * as Sentry from '@sentry/node';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { SnakeCaseResponseInterceptor } from './common/interceptors/snake-case-response.interceptor';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter';

async function bootstrap(): Promise<void> {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    });
  }

  const app = await NestFactory.create(AppModule);

  // Design D5 — socket.io Redis adapter for cross-instance room broadcast.
  app.useWebSocketAdapter(new RedisIoAdapter(app));

  // T4.3a — HTTP security headers (X-Frame-Options, X-Content-Type-Options,
  // Strict-Transport-Security, etc.) on every response, including CORS.
  app.use(helmet());

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
