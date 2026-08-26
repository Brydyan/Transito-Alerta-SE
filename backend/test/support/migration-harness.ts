import { readFileSync } from 'fs';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { Client } from 'pg';

import { listMigrations, readSql, type MigrationFile } from '../../scripts/lib/migration-files';

/**
 * T7 D7.1 — a bare Postgres+PostGIS container with NO Nest app on top.
 *
 * `TestEnvironment` boots the whole application and applies every migration
 * up front; that is the right harness for behavioural specs, and the wrong
 * one for the migration machinery itself, which needs to control exactly
 * which migrations have run (backfill on a populated schema vs. an empty one,
 * re-application, drift, rollback). This class gives that control and nothing
 * else.
 *
 * Uses the simple query protocol (`client.query(sql)` with a plain string, no
 * parameters) for the same reason `test/support/run-migrations.ts` does: it
 * allows several `;`-separated statements per call, like `psql -f file`, so
 * files that carry their own `BEGIN`/`COMMIT` run as one round trip.
 */
export class MigrationHarness {
  private constructor(
    readonly client: Client,
    readonly connection: { host: string; port: number; user: string; password: string; database: string },
    private readonly container: StartedTestContainer,
  ) {}

  static async start(): Promise<MigrationHarness> {
    const container = await new GenericContainer('postgis/postgis:16-3.4')
      .withExposedPorts(5432)
      .withEnvironment({
        POSTGRES_DB: 'migration_test',
        POSTGRES_USER: 'postgres',
        POSTGRES_PASSWORD: 'postgres',
      })
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .withStartupTimeout(60_000)
      .start();

    const connection = {
      host: container.getHost(),
      port: container.getMappedPort(5432),
      user: 'postgres',
      password: 'postgres',
      database: 'migration_test',
    };

    const client = new Client(connection);
    await client.connect();

    return new MigrationHarness(client, connection, container);
  }

  /** `postgres://…` for the runner CLI, which reads DATABASE_URL. */
  get databaseUrl(): string {
    const { user, password, host, port, database } = this.connection;
    return `postgres://${user}:${password}@${host}:${port}/${database}`;
  }

  /**
   * Applies every migration whose version falls in `[from, to]` inclusive,
   * in numeric order. Both bounds are optional: `applyRange({ to: '0029' })`
   * reproduces "the schema as deployed to Supabase today".
   */
  async applyRange({ from, to }: { from?: string; to?: string } = {}): Promise<void> {
    for (const migration of listMigrations()) {
      if (from !== undefined && migration.version < from) continue;
      if (to !== undefined && migration.version > to) continue;
      await this.client.query(readSql(migration));
    }
  }

  /** Applies one migration by version, e.g. `'0030'`. Throws if unknown. */
  async applyVersion(version: string): Promise<void> {
    const migration = this.migration(version);
    await this.client.query(readSql(migration));
  }

  migration(version: string): MigrationFile {
    const found = listMigrations().find((m) => m.version === version);
    if (!found) throw new Error(`No migration file for version ${version}`);
    return found;
  }

  /** Applies an arbitrary `.sql` file by absolute path (used for rollbacks). */
  async applyFile(path: string): Promise<void> {
    await this.client.query(readFileSync(path, 'utf8'));
  }

  async rows<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const result = await this.client.query<T>(sql, params);
    return result.rows;
  }

  async tableExists(name: string): Promise<boolean> {
    const rows = await this.rows<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1
       ) AS exists`,
      [name],
    );
    return rows[0].exists;
  }

  async columnExists(table: string, column: string): Promise<boolean> {
    const rows = await this.rows<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
       ) AS exists`,
      [table, column],
    );
    return rows[0].exists;
  }

  async indexExists(name: string): Promise<boolean> {
    const rows = await this.rows<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1
       ) AS exists`,
      [name],
    );
    return rows[0].exists;
  }

  /** Every table in `public`, sorted — used by the rollback-cycle spec. */
  async publicTables(): Promise<string[]> {
    const rows = await this.rows<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    );
    return rows.map((r) => r.table_name);
  }

  async stop(): Promise<void> {
    await this.client.end().catch(() => undefined);
    await this.container.stop();
  }
}
