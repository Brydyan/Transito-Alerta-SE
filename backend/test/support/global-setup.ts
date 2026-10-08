import { GenericContainer, Wait } from 'testcontainers';
import { Client } from 'pg';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyMigrations } from './run-migrations';

export const E2E_SHARED_ENV_FILE = path.join(os.tmpdir(), 'tase-e2e-shared.json');

export default async function globalSetup(): Promise<void> {
  // Do NOT disable Ryuk. globalSetup and globalTeardown run in the same main
  // Jest process; Ryuk only reaps containers when that process exits, which
  // happens after globalTeardown has already stopped them. Disabling Ryuk
  // causes containers to leak on interrupted runs (Ctrl-C, crash).

  const postgresContainer = await new GenericContainer('postgis/postgis:16-3.4')
    .withExposedPorts(5432)
    .withEnvironment({
      POSTGRES_DB: 'transito_alerta_test',
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: 'postgres',
    })
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .withStartupTimeout(60_000)
    .start();

  const redisContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
    .withStartupTimeout(30_000)
    .start();

  const dbHost = postgresContainer.getHost();
  const dbPort = postgresContainer.getMappedPort(5432);
  const redisHost = redisContainer.getHost();
  const redisPort = redisContainer.getMappedPort(6379);

  // Run migrations once — each spec reuses this schema and calls reset() to wipe rows.
  const migrationClient = new Client({
    host: dbHost,
    port: dbPort,
    user: 'postgres',
    password: 'postgres',
    database: 'transito_alerta_test',
  });
  await migrationClient.connect();
  await applyMigrations(migrationClient);
  await migrationClient.end();

  // Write connection info to a temp file so the worker process (test-environment.ts)
  // can read it. Jest workers inherit process.env from the main process at spawn time,
  // but the temp file is the safest cross-process channel.
  fs.writeFileSync(
    E2E_SHARED_ENV_FILE,
    JSON.stringify({ dbHost, dbPort, redisHost, redisPort }),
    'utf8',
  );

  // Keep container refs alive for globalTeardown (same main process).
  (global as Record<string, unknown>)['__TASE_PG_CONTAINER__'] = postgresContainer;
  (global as Record<string, unknown>)['__TASE_REDIS_CONTAINER__'] = redisContainer;
}
