import { createHash } from 'crypto';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * T7 D7.1 — shared migration-file discovery for the runner
 * (`scripts/run-migrations.ts`) and for the e2e specs that exercise it.
 *
 * Deliberately dependency-free (no pg, no Nest): both the CLI and the test
 * harness import it, and neither should have to boot anything to ask "what
 * migrations exist and what is their checksum".
 */

/** `database/migrations` and `database/rollback`, resolved from this file. */
const REPO_ROOT = join(__dirname, '../../..');
export const MIGRATIONS_DIR = join(REPO_ROOT, 'database/migrations');
export const ROLLBACK_DIR = join(REPO_ROOT, 'database/rollback');

/** `0031_soft_delete_completeness.sql` → version `0031`, name `soft_delete_completeness`. */
const MIGRATION_FILE_RE = /^([0-9]+)_(.+)\.sql$/;

export interface MigrationFile {
  /** Zero-padded numeric prefix, e.g. `0030`. Primary key in `schema_migrations`. */
  version: string;
  /** Filename minus version prefix and `.sql`, e.g. `schema_migrations`. */
  name: string;
  fileName: string;
  path: string;
}

/**
 * Every `database/migrations/[0-9]*.sql`, in numeric order — the same order
 * `test/support/run-migrations.ts` uses and the same one a human follows when
 * pasting into the Supabase SQL editor (CC3: nothing auto-applies).
 */
export function listMigrations(dir: string = MIGRATIONS_DIR): MigrationFile[] {
  return readdirSync(dir)
    .filter((fileName) => MIGRATION_FILE_RE.test(fileName))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((fileName) => {
      const [, version, name] = MIGRATION_FILE_RE.exec(fileName) as RegExpExecArray;
      return { version, name, fileName, path: join(dir, fileName) };
    });
}

/**
 * The matching `database/rollback/<version>_<name>.DOWN.sql`, or null when the
 * migration has none (R3.2 asserts every 0030+ migration does).
 */
export function rollbackPathFor(migration: MigrationFile, dir: string = ROLLBACK_DIR): string | null {
  const path = join(dir, `${migration.version}_${migration.name}.DOWN.sql`);
  return existsSync(path) ? path : null;
}

/**
 * SHA-256 of the file's raw bytes — not of a normalised statement (design D2).
 * Editing an already-applied migration is an operational error to surface, so
 * whitespace and comment changes must count as drift too.
 */
export function checksumOf(migration: MigrationFile): string {
  return createHash('sha256').update(readFileSync(migration.path)).digest('hex');
}

export function readSql(migration: MigrationFile): string {
  return readFileSync(migration.path, 'utf8');
}
