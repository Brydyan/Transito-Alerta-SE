import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { Client } from 'pg';

const MIGRATIONS_DIR = join(__dirname, '../../../database/migrations');

/**
 * Applies every `database/migrations/[0-9]*.sql` file, in numeric order,
 * against an empty database — the exact command CI's `migrations` job runs
 * (`.github/workflows/ci.yml`) and the exact one a human runs by hand
 * against Supabase (CC3: `synchronize`/`migrationsRun` stay false
 * everywhere, nothing auto-applies). Running it here against a throwaway
 * Testcontainers Postgres is this harness's proof that the manual-migration
 * path actually works from a clean schema, not just that the SQL parses.
 *
 * `client.query(sql)` with a plain string (no parameters) uses pg's simple
 * query protocol, which — like `psql -f file` — allows multiple
 * semicolon-separated statements in one call, so files like 0003's seed data
 * (no explicit BEGIN/COMMIT) still run as a single round trip.
 */
export async function applyMigrations(client: Client): Promise<void> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^[0-9]+_.*\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    await client.query(sql);
  }
}
