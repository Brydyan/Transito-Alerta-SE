#!/usr/bin/env ts-node
/**
 * backend/scripts/rebuild-feed.ts
 *
 * T7.9.D8 (design.md D10) — reconstruye el feed del ciudadano en Redis
 * (clave `feed:incidents`, TTL 3 600 000 ms) leyendo los incidentes
 * activos de Postgres. Corre al final de `db:seed` / `db:seed:mass` para
 * que la caché refleje el estado recién sembrado sin pasar por los
 * listeners de la app.
 *
 * Por qué `createApplicationContext` y no `create`:
 *   - `create()` boot-ea un servidor HTTP completo (interceptors, pipes,
 *     helmet, CORS) — innecesario para un script de consola que sólo
 *     necesita resolver el grafo DI.
 *   - `createApplicationContext` monta exactamente los mismos providers
 *     (TypeORM, Redis, CacheModule, ScheduleModule) sin abrir puerto.
 *   - `app.close()` libera los handles de Redis y TypeORM — sin esto el
 *     event loop queda abierto y Node no sale con código 0.
 *
 * Por qué NO un endpoint `POST /admin/feed/rebuild`:
 *   - Está detrás de JwtAuthGuard + PermissionGuard ⇒ un seeder tendría
 *     que emitir o guardar un token con privilegios (problema de
 *     credencial para una herramienta de dev).
 *   - Requiere un servidor en pie, lo cual no es cierto durante el
 *     bootstrap de una base nueva.
 *
 * Por qué NO reimplementar el write a Redis:
 *   - Duplicaría el mapeo `FeedItemDto`, la constante `CITIZEN_FEED_KEY`
 *     y el TTL de 3 600 000 ms ya en `FeedRecoveryService`. Drift
 *     silencioso entre el script y la app.
 *
 * Uso:
 *   ts-node scripts/rebuild-feed.ts                 # limit=200 (default)
 *   ts-node scripts/rebuild-feed.ts --limit=1000    # override explícito
 */
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { FeedRecoveryService } from '../src/modules/incidents/feed-recovery.service';
import { enforce } from '../../database/seeds/lib/guard';

interface CliOptions {
  limit: number;
  force: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  let limit = 200;
  let force = false;
  for (const arg of argv) {
    if (arg === '--force') {
      force = true;
    } else if (arg.startsWith('--limit=')) {
      const value = Number.parseInt(arg.slice('--limit='.length), 10);
      if (Number.isInteger(value) && value > 0 && value <= 5000) {
        limit = value;
      } else {
        throw new Error(`rebuild-feed: --limit debe ser entero positivo ≤ 5000 (recibido: ${arg})`);
      }
    }
  }
  return { limit, force };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  // Misma guarda que los seeders (T7.9.D3 / design.md D11) — un script
  // que escribe a Redis cache desde una base remota debe estar en una
  // lista de hosts explícitamente permitidos.
  enforce({ scriptName: 'rebuild-feed.ts', argv: process.argv.slice(2) });

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const feedRecovery = app.get(FeedRecoveryService);
    const rebuilt = await feedRecovery.rebuildFeed(opts.limit);
    // eslint-disable-next-line no-console
    console.log(
      `rebuild-feed: limit=${opts.limit} force=${opts.force} rebuilt=${rebuilt}`,
    );
    process.exitCode = 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`rebuild-feed: ${message}`);
    process.exitCode = 1;
  } finally {
    // Cierra Redis/TypeORM/Sockets — sin esto el proceso no sale con 0.
    await app.close();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error(`rebuild-feed: FATAL ${message}`);
  process.exit(1);
});
