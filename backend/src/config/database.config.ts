import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * Database configuration.
 *
 * IMPORTANT (CC3 — Manual Migration Integrity):
 * `synchronize` and `migrationsRun` MUST stay false. Schema changes are
 * applied exclusively via the paired up/down SQL files in
 * `database/migrations/`, tracked in `database/migrations/MIGRATION_LOG.md`.
 */
export default registerAs(
  'database',
  (): TypeOrmModuleOptions => ({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST ?? 'localhost',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'transito_alerta',
    autoLoadEntities: true,
    synchronize: false,
    migrationsRun: false,
    ssl:
      process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: false }
        : undefined,
    logging: process.env.DB_LOGGING === 'true',
  }),
);
