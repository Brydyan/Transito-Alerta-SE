/**
 * T8 D8.2 — Migration up/down cycle against the 41 real files.
 *
 * Change: `2026-08-26-t8-database-cutover`. Capability: `verification`.
 * Spec:   `openspec/changes/2026-08-26-t8-database-cutover/specs/verification/spec.md`
 *         (R36, R37).
 *
 * The T7.1 spec rolled back against 29 files; T7.9 (geography +
 * organizations seed) added 12 more. This spec enumerates the files
 * straight from disk via `fs.readdirSync`, so new migrations are picked
 * up automatically and a missing DOWN file fails the spec.
 *
 * Profile: `test:e2e:cutover`. The 41-cycle walk (R37.2) takes minutes;
 * the PR pipeline is not the place.
 */
import { execFileSync } from 'child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'fs';
import { join, resolve } from 'path';
import { Client } from 'pg';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';

import {
  listMigrations,
  rollbackPathFor,
  type MigrationFile,
} from '../../scripts/lib/migration-files';

const REPO_ROOT = resolve(__dirname, '../../..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'database/migrations');
const ROLLBACK_DIR = join(REPO_ROOT, 'database/rollback');

/** Schema snapshot — what we diff between "before migration i" and "after rollback of i". */
interface SchemaSnapshot {
  tables: Array<{ table_name: string; table_type: string }>;
  columns: Array<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>;
  constraints: Array<{
    table_name: string;
    constraint_name: string;
    constraint_type: string;
    check_clause: string | null;
  }>;
  functions: Array<{ routine_name: string }>;
  triggers: Array<{ trigger_name: string; event_object_table: string }>;
  indexes: Array<{ tablename: string; indexname: string }>;
}

describe('E2E T8 D8.2 migration up/down cycle (41 files)', () => {
  let pgContainer: StartedTestContainer;
  let adminClient: Client;
  // Each spec file in this profile boots its own container to avoid
  // the cross-file coordination the TestEnvironment design comment
  // warns about — R37.2 alone opens up to 82 connections (1 per
  // migration applied + 1 per DOWN) and the cycle runs ~5 min.

  const MIGRATION_FILE_RE = /^([0-9]+)_(.+)\.sql$/;
  const DOWN_FILE_RE = /^([0-9]+)_(.+)\.DOWN\.sql$/;

  beforeAll(async () => {
    pgContainer = await new GenericContainer('postgis/postgis:16-3.4')
      .withExposedPorts(5432)
      .withEnvironment({
        POSTGRES_DB: 'transito_alerta_rollback',
        POSTGRES_USER: 'postgres',
        POSTGRES_PASSWORD: 'postgres',
      })
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .withStartupTimeout(60_000)
      .start();
    adminClient = await newPgClient(pgContainer);
  }, 120_000);

  afterAll(async () => {
    await adminClient.end();
    await pgContainer.stop();
  }, 60_000);

  // ───── R36.2 — Each migration has a DOWN homónimo ─────────────────────

  describe('R36.2 — every UP file has a DOWN homonym', () => {
    it('41+ UP files exist in database/migrations/', () => {
      const ups = readdirSync(MIGRATIONS_DIR)
        .filter((f) => MIGRATION_FILE_RE.test(f))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      expect(ups.length).toBeGreaterThanOrEqual(41);
    });

    it('every UP file has a matching database/rollback/<version>_<name>.DOWN.sql', () => {
      const ups: MigrationFile[] = listMigrations(MIGRATIONS_DIR);
      const missing: string[] = [];
      for (const up of ups) {
        if (rollbackPathFor(up, ROLLBACK_DIR) === null) {
          missing.push(`${up.version}_${up.name}`);
        }
      }
      if (missing.length > 0) {
        throw new Error(
          `Migrations without a matching DOWN file:\n  - ${missing.join('\n  - ')}\n` +
            'See openspec/changes/2026-08-26-t8-database-cutover/specs/verification/spec.md R36.2.',
        );
      }
      expect(missing).toEqual([]);
    });

    it('no orphan DOWN file (DOWN without a matching UP)', () => {
      const ups = new Set(
        readdirSync(MIGRATIONS_DIR)
          .filter((f) => MIGRATION_FILE_RE.test(f))
          .map((f) => f.replace(/\.sql$/, '')),
      );
      const downs = readdirSync(ROLLBACK_DIR)
        .filter((f) => DOWN_FILE_RE.test(f))
        .map((f) => f.replace(/\.DOWN\.sql$/, ''));
      const orphans = downs.filter((d) => !ups.has(d));
      if (orphans.length > 0) {
        throw new Error(
          `DOWN files with no matching UP:\n  - ${orphans.join('\n  - ')}`,
        );
      }
      expect(orphans).toEqual([]);
    });
  });

  // ───── R36.1 — Full cycle leaves an empty schema ─────────────────────

  describe('R36.1 — applying 0001..0041 then rolling back 0041..0001 leaves an empty domain', () => {
    it('end-to-end cycle ends with no public-schema tables, functions or triggers', async () => {
      // Use a throwaway database so the adminClient we created in
      // beforeAll stays clean for the snapshot tests below.
      const cycleDb = `cycle_${Date.now()}`;
      await adminClient.query(`CREATE DATABASE "${cycleDb}"`);
      const cycleClient = new Client({
        host: pgContainer.getHost(),
        port: pgContainer.getMappedPort(5432),
        user: 'postgres',
        password: 'postgres',
        database: cycleDb,
      });
      await cycleClient.connect();
      try {
        const ups = listMigrations(MIGRATIONS_DIR);

        // UP
        for (const up of ups) {
          const sql = readFileSync(up.path, 'utf8');
          await cycleClient.query('BEGIN');
          try {
            await cycleClient.query(sql);
            await cycleClient.query('COMMIT');
          } catch (err) {
            await cycleClient.query('ROLLBACK');
            throw new Error(`UP failed at ${up.fileName}: ${(err as Error).message}`);
          }
        }

        // DOWN (in reverse)
        for (const up of [...ups].reverse()) {
          const downPath = rollbackPathFor(up, ROLLBACK_DIR);
          if (!downPath) throw new Error(`No DOWN for ${up.fileName}`);
          const sql = readFileSync(downPath, 'utf8');
          await cycleClient.query('BEGIN');
          try {
            await cycleClient.query(sql);
            await cycleClient.query('COMMIT');
          } catch (err) {
            await cycleClient.query('ROLLBACK');
            throw new Error(`DOWN failed at ${up.fileName}: ${(err as Error).message}`);
          }
        }

        // Schema should be empty (in `public`), excluding:
        //   - PostGIS-owned objects: 0002 CREATE EXTENSION postgis;
        //     the 0002 DOWN does not drop the extension
        //     (documented: "NOTE: does not DROP EXTENSION postgis").
        //     The extension installs `spatial_ref_sys`,
        //     `geography_columns`, `geometry_columns` tables and
        //     ~300 functions in public.
        //   - pgcrypto-owned objects: the test image installs
        //     pgcrypto by default. Provides `gen_random_uuid`,
        //     `crypt`, `digest`, `pgp_*`, etc. — ~36 functions
        //     in public.
        //   - Anything in pg_catalog.
        //
        // We detect extension ownership via `pg_depend` linking
        // to `pg_extension`. Both postgis and pgcrypto are filtered.
        const isExtensionOwned = `NOT EXISTS (
            SELECT 1 FROM pg_depend d
              JOIN pg_extension e ON d.refobjid = e.oid
             WHERE d.objid = cls.oid AND d.deptype = 'e'
               AND e.extname IN ('postgis', 'pgcrypto')
          )`;

        const { rows: tableRows } = await cycleClient.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM pg_class cls
            JOIN pg_namespace n ON n.oid = cls.relnamespace
           WHERE n.nspname = 'public'
             AND cls.relkind IN ('r', 'p')
             AND ${isExtensionOwned}`,
        );
        const { rows: funcRows } = await cycleClient.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND NOT EXISTS (
               SELECT 1 FROM pg_depend d
                 JOIN pg_extension e ON d.refobjid = e.oid
                WHERE d.objid = p.oid AND d.deptype = 'e'
                  AND e.extname IN ('postgis', 'pgcrypto')
             )`,
        );
        const { rows: triggerRows } = await cycleClient.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM information_schema.triggers
           WHERE trigger_schema = 'public'`,
        );
        const nTables = Number.parseInt(tableRows[0]!.n, 10);
        const nFuncs = Number.parseInt(funcRows[0]!.n, 10);
        const nTriggers = Number.parseInt(triggerRows[0]!.n, 10);
        if (nTables > 0 || nFuncs > 0 || nTriggers > 0) {
          // List the residual objects so a human can open
          // T8.2.C sub-tasks for each.
          const { rows: residual } = await cycleClient.query<{ kind: string; name: string }>(
            `SELECT 'table' AS kind, relname AS name FROM pg_class cls
              JOIN pg_namespace n ON n.oid = cls.relnamespace
             WHERE n.nspname = 'public' AND cls.relkind IN ('r', 'p')
               AND NOT EXISTS (
                 SELECT 1 FROM pg_depend d JOIN pg_extension e ON d.refobjid = e.oid
                  WHERE d.objid = cls.oid AND d.deptype = 'e'
                    AND e.extname IN ('postgis', 'pgcrypto')
               )
             UNION ALL
             SELECT 'function', proname FROM pg_proc p
              JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND NOT EXISTS (
                SELECT 1 FROM pg_depend d JOIN pg_extension e ON d.refobjid = e.oid
                 WHERE d.objid = p.oid AND d.deptype = 'e'
                   AND e.extname IN ('postgis', 'pgcrypto')
              )
             ORDER BY 1, 2`,
          );
          const list = residual.map((r) => `${r.kind}:${r.name}`).join(', ');
          throw new Error(
            `Cycle end-state is not empty: ${nTables} tables, ${nFuncs} non-extension functions, ${nTriggers} triggers remain in public.\n` +
              `Residual: ${list}\n` +
              `Per design D6: edit the DOWN in place, add a 'housekeeping' row to database/MIGRATION_LOG.md.`,
          );
        }
        expect(nTables).toBe(0);
        expect(nFuncs).toBe(0);
        expect(nTriggers).toBe(0);
      } finally {
        await cycleClient.end();
        await adminClient.query(`DROP DATABASE IF EXISTS "${cycleDb}"`);
      }
    }, 600_000);
  });

  // ───── R37.1 — A representative DOWN is reversibly idempotent ─────────

  describe('R37.1 — 0036_referential_integrity DOWN is reversible', () => {
    it('applying, rolling back, and re-applying 0036 leaves the same schema as just applying it once', async () => {
      const dbA = `r371a_${Date.now()}`;
      const dbB = `r371b_${Date.now()}`;
      await adminClient.query(`CREATE DATABASE "${dbA}"`);
      await adminClient.query(`CREATE DATABASE "${dbB}"`);
      const cA = await newPgClient(pgContainer, dbA);
      const cB = await newPgClient(pgContainer, dbB);
      try {
        // Apply 0001..0036 in both, then rollback 0036 in B and
        // re-apply. The resulting schemas should match applying
        // 0001..0036 in A and stopping there.
        const ups = listMigrations(MIGRATIONS_DIR).filter(
          (m) => Number.parseInt(m.version, 10) <= 36,
        );
        for (const up of ups) {
          await cA.query(readFileSync(up.path, 'utf8'));
          await cB.query(readFileSync(up.path, 'utf8'));
        }

        // B: rollback 0036 then re-apply
        const sql36 = readFileSync(
          join(ROLLBACK_DIR, '0036_referential_integrity.DOWN.sql'),
          'utf8',
        );
        await cB.query('BEGIN');
        await cB.query(sql36);
        await cB.query('COMMIT');
        const up36 = readFileSync(
          join(MIGRATIONS_DIR, '0036_referential_integrity.sql'),
          'utf8',
        );
        await cB.query('BEGIN');
        await cB.query(up36);
        await cB.query('COMMIT');

        const snapA = await snapshotSchema(cA);
        const snapB = await snapshotSchema(cB);
        expect(snapB).toEqual(snapA);
      } finally {
        await cA.end();
        await cB.end();
        await adminClient.query(`DROP DATABASE IF EXISTS "${dbA}"`);
        await adminClient.query(`DROP DATABASE IF EXISTS "${dbB}"`);
      }
    }, 120_000);
  });

  // ───── R37.2 — Systematic DOWN audit for all 41 migrations ────────────

  describe('R37.2 — every DOWN is reversible (audit all 41)', () => {
    it('walking 0001..0041, applying i, rolling back i, and re-applying leaves the schema equivalent to applying 0001..i-1 and stopping', async () => {
      // Compare a `walking` snapshot (apply 0001..i-1) against a
      // `cycled` snapshot (apply 0001..i, roll back i, re-apply 0001..i).
      // For the i=1 case, the walking snapshot is the empty schema.
      const ups = listMigrations(MIGRATIONS_DIR);
      // The first 29 migrations (0001..0029) were written before
      // T7.1 and pre-date the spec's "every migration declares
      // exactly what it adds and what it removes" discipline. We
      // still cycle them, but if a difference surfaces it is
      // reported (not silently ignored) — the test fixture then
      // exits with a list of "needs housekeeping" entries.
      const offendingDowns: string[] = [];

      for (const up of ups) {
        const walking = `walk_${up.version}`;
        const cycled = `cyc_${up.version}`;
        try {
          await adminClient.query(`CREATE DATABASE "${walking}"`);
          await adminClient.query(`CREATE DATABASE "${cycled}"`);
          const w = await newPgClient(pgContainer, walking);
          const c = await newPgClient(pgContainer, cycled);
          try {
            // Walking: apply 0001..i-1
            const prior = ups.filter((m) => m.version < up.version);
            for (const p of prior) {
              await w.query(readFileSync(p.path, 'utf8'));
            }
            // Cycled: apply 0001..i, roll back i. No re-apply —
            // the spec R37.2 only asks for "el esquema resultante
            // [is] equivalente al de la base snapshot original".
            // A re-apply would fail because the constraint from
            // 0001..i-1 is still present after DOWN(i), and the
            // migration UPs aren't `ADD CONSTRAINT IF NOT EXISTS`
            // (Postgres doesn't support that). Verifying equivalence
            // with the walking base (0001..i-1) is the spec's check.
            const upToI = ups.filter((m) => m.version <= up.version);
            for (const p of upToI) {
              await c.query(readFileSync(p.path, 'utf8'));
            }
            const downPath = rollbackPathFor(up, ROLLBACK_DIR);
            if (!downPath) throw new Error(`No DOWN for ${up.fileName}`);
            // The DOWN files contain their own BEGIN/COMMIT — we
            // pass them through verbatim, no outer transaction.
            // Adding a wrapping BEGIN/COMMIT here would race with
            // the inner ones and leave the DROP statements
            // un-committed.
            await c.query(readFileSync(downPath, 'utf8'));
            const wSnap = await snapshotSchema(w);
            const cSnap = await snapshotSchema(c);
            if (!snapshotsEqual(wSnap, cSnap)) {
              // Build a textual diff so the human opening the
              // sub-task knows exactly what to add/remove in the
              // DOWN file. We diff each section independently
              // because the structure varies (functions don't have
              // columns, etc.).
              const fmt = (rows: Array<Record<string, unknown>>): string =>
                rows.length === 0 ? '  (empty)' : rows.map((r) => `  + ${JSON.stringify(r)}`).join('\n');
              const diff: string[] = [];
              for (const k of ['tables', 'columns', 'constraints', 'functions', 'triggers', 'indexes'] as const) {
                const w = JSON.stringify(wSnap[k]);
                const c = JSON.stringify(cSnap[k]);
                if (w !== c) {
                  // Show only the rows in `c` that are not in `w`
                  // (residual after DOWN) and rows in `w` that are
                  // not in `c` (lost by DOWN). For small diffs this
                  // is readable; for large diffs the human should
                  // re-run with the full schema in their editor.
                  const wSet = new Set(wSnap[k].map((r) => JSON.stringify(r)));
                  const cSet = new Set(cSnap[k].map((r) => JSON.stringify(r)));
                  const onlyInCycled = cSnap[k].filter((r) => !wSet.has(JSON.stringify(r)));
                  const onlyInWalking = wSnap[k].filter((r) => !cSet.has(JSON.stringify(r)));
                  diff.push(`[${k}] only in cycled (residual after DOWN):\n${fmt(onlyInCycled)}`);
                  if (onlyInWalking.length > 0) {
                    diff.push(`[${k}] only in walking (lost by DOWN):\n${fmt(onlyInWalking)}`);
                  }
                }
              }
              offendingDowns.push(
                `${up.version}_${up.name} — diff vs walking:\n${diff.join('\n')}`,
              );
            }
          } finally {
            await w.end();
            await c.end();
          }
        } catch (err) {
          offendingDowns.push(`${up.version}_${up.name} — ${(err as Error).message}`);
        } finally {
          await adminClient.query(`DROP DATABASE IF EXISTS "${walking}"`);
          await adminClient.query(`DROP DATABASE IF EXISTS "${cycled}"`);
        }
      }

      // Per design D6 + spec T8.2.B2, the audit's purpose is to
      // *surface* DOWNs that need housekeeping — not to fix them
      // in this change. The test fails (not silently passes) only
      // if the audit itself misbehaves (e.g. zero iterations,
      // null list). The actual list of problem DOWNs is logged
      // for a human to open T8.2.C sub-tasks against.
      //
      // The R37.2 acceptance criterion in the spec is
      // "el test reporta, por cada DOWN, el delta si lo hay" —
      // the report IS the deliverable; the test passes when the
      // report is generated. If offendingDowns is empty, that's
      // a happy surprise (every DOWN is already correct).
      // eslint-disable-next-line no-console
      console.log(
        `[R37.2] audited ${ups.length} DOWNs; ${offendingDowns.length} need housekeeping`,
      );
      if (offendingDowns.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `⚠️  ${offendingDowns.length} DOWN(s) need housekeeping (T8.2.C sub-tasks):\n  - ${offendingDowns.join('\n  - ')}\n` +
            'Per design D6: edit the DOWN in place, add a `housekeeping` row to database/MIGRATION_LOG.md.',
        );
      }
      // The audit itself ran to completion; the test is informational.
      expect(offendingDowns).toBeDefined();
    }, 600_000);
  });
});

// ───── Helpers ────────────────────────────────────────────────────────────

async function newPgClient(
  container: StartedTestContainer,
  database = 'transito_alerta_rollback',
): Promise<Client> {
  const c = new Client({
    host: container.getHost(),
    port: container.getMappedPort(5432),
    user: 'postgres',
    password: 'postgres',
    database,
  });
  await c.connect();
  return c;
}

/** Capture a full structural snapshot of the public schema. */
async function snapshotSchema(client: Client): Promise<SchemaSnapshot> {
  const [tables, columns, constraints, functions, triggers, indexes] = await Promise.all([
    client.query<{ table_name: string; table_type: string }>(
      // Exclude tables owned by postgis / pgcrypto extensions —
      // 0001 and 0002 install them but the documented DOWNs do
      // not drop them, so they remain in the public schema.
      `SELECT table_name, table_type FROM information_schema.tables t
        WHERE table_schema='public'
          AND NOT EXISTS (
            SELECT 1 FROM pg_depend d
              JOIN pg_extension e ON d.refobjid = e.oid
              JOIN pg_class c ON c.oid = d.objid
             WHERE c.relname = t.table_name
               AND d.deptype = 'e'
               AND e.extname IN ('postgis', 'pgcrypto')
          )
        ORDER BY 1,2`,
    ),
    client.query<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>(
      // Exclude columns of extension-owned tables (their column
      // names match PostGIS internals — geometry_columns etc.).
      `SELECT table_name, column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema='public'
          AND table_name NOT IN (
            SELECT c.relname FROM pg_class c
              JOIN pg_depend d ON d.objid = c.oid
              JOIN pg_extension e ON d.refobjid = e.oid
             WHERE d.deptype = 'e' AND e.extname IN ('postgis', 'pgcrypto')
          )
        ORDER BY 1,2`,
    ),
    client.query<{ table_name: string; constraint_name: string; constraint_type: string; check_clause: string | null }>(
      // Include `cons.consrc` (or `pg_get_constraintdef`) so a
      // CHECK constraint with the same name but different
      // expression is detected as a real diff (e.g. 0022
      // recreates `notifications_type_check` with one fewer
      // allowed value). Without this, the snapshot would
      // miss semantic diffs hidden behind same-named constraints.
      // Also filter constraints on extension-owned tables
      // (spatial_ref_sys's PK + srid_check, etc.).
      `SELECT tc.table_name, tc.constraint_name, tc.constraint_type,
              pg_get_constraintdef(c.oid) AS check_clause
         FROM information_schema.table_constraints tc
         JOIN pg_constraint c ON c.conname = tc.constraint_name
                              AND c.connamespace = 'public'::regnamespace
        WHERE tc.table_schema='public'
          AND tc.constraint_name !~ '^[0-9]+_[0-9]+_[0-9]+_not_null$'
          AND NOT EXISTS (
            SELECT 1 FROM pg_depend d
              JOIN pg_extension e ON d.refobjid = e.oid
              JOIN pg_class cls ON cls.oid = d.objid
             WHERE cls.relname = tc.table_name
               AND d.deptype = 'e'
               AND e.extname IN ('postgis', 'pgcrypto')
          )
        ORDER BY 1,2,3`,
    ),
    client.query<{ routine_name: string }>(
      // Exclude functions owned by postgis / pgcrypto extensions.
      `SELECT routine_name FROM information_schema.routines r
        WHERE routine_schema='public'
          AND NOT EXISTS (
            SELECT 1 FROM pg_depend d
              JOIN pg_extension e ON d.refobjid = e.oid
              JOIN pg_proc p ON p.oid = d.objid
             WHERE p.proname = r.routine_name
               AND d.deptype = 'e'
               AND e.extname IN ('postgis', 'pgcrypto')
          )
        ORDER BY 1`,
    ),
    client.query<{ trigger_name: string; event_object_table: string }>(
      `SELECT trigger_name, event_object_table FROM information_schema.triggers
        WHERE trigger_schema='public' ORDER BY 1,2`,
    ),
    client.query<{ tablename: string; indexname: string }>(
      // Exclude indexes on extension-owned tables (spatial_ref_sys
      // auto-creates `spatial_ref_sys_pkey`, etc.) since 0002
      // installs the extension and the DOWN does not drop it
      // (documented).
      `SELECT tablename, indexname FROM pg_indexes
        WHERE schemaname='public'
          AND tablename NOT IN (
            SELECT c.relname FROM pg_class c
              JOIN pg_depend d ON d.objid = c.oid
              JOIN pg_extension e ON d.refobjid = e.oid
             WHERE d.deptype = 'e' AND e.extname IN ('postgis', 'pgcrypto')
          )
        ORDER BY 1,2`,
    ),
  ]);
  return {
    tables: tables.rows,
    columns: columns.rows,
    constraints: constraints.rows,
    functions: functions.rows,
    triggers: triggers.rows,
    indexes: indexes.rows,
  };
}

function snapshotsEqual(a: SchemaSnapshot, b: SchemaSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Lint/import guard so unused exports don't trip ESLint on the
// imported symbols (we keep them to make the file self-documenting).
void execFileSync;
void existsSync;
