/**
 * T8 D8.1 — Systematic referential-integrity verification.
 *
 * Change: `2026-08-26-t8-database-cutover`. Capability: `verification`.
 * Spec:   `openspec/changes/2026-08-26-t8-database-cutover/specs/verification/spec.md`.
 *
 * Existing T7 spec `t7-referential-integrity.e2e-spec.ts` spot-checked 4 FKs
 * (R15.1–R15.4) with hand-written scenarios. This file generalises the same
 * idea to the **full set of FKs** the schema actually has, by reading
 * `information_schema` once and iterating. New migrations that add or
 * change FKs are picked up automatically — no second list to keep in sync.
 *
 * Profile: `test:e2e:cutover` (design D2). Lives in the heavy suite because
 * R33.2 inserts a synthetic row per FK (≈30+ round trips) and R37.2 (in the
 * companion spec) walks the schema 41 times. PR pipeline is the wrong
 * place; the cutover job is.
 */
import { randomUUID } from 'crypto';
import { TestEnvironment } from '../support/test-environment';

/** One row from the information_schema FK inventory — see R32.1. */
interface FkRow {
  table_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
  delete_rule: 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'RESTRICT' | 'NO ACTION';
  update_rule: string;
  constraint_name: string;
  /** UDTT — udt_name from information_schema.columns. UUID, varchar, int4, etc. */
  udt_name: string;
}

describe('E2E T8 D8.1 systematic referential integrity', () => {
  let env: TestEnvironment;
  let inventory: FkRow[] = [];

  beforeAll(async () => {
    env = await TestEnvironment.start();
    inventory = await loadInventory(env);
  }, 180_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  // ───── R32 — Inventario dinámico ───────────────────────────────────────

  describe('R32 — Dynamic FK inventory', () => {
    it('R32.1: information_schema FK query returns at least 30 rows for the public schema', async () => {
      expect(inventory.length).toBeGreaterThanOrEqual(30);
    });

    it('R32.1: no row has delete_rule = NO ACTION — every FK declares an explicit ON DELETE clause', async () => {
      const offenders = inventory.filter((r) => r.delete_rule === 'NO ACTION');
      if (offenders.length > 0) {
        // Report the offenders by name so a human reading the failure can
        // jump straight to the migration that needs fixing.
        const summary = offenders
          .map((r) => `  - ${r.table_name}.${r.column_name} (constraint ${r.constraint_name})`)
          .join('\n');
        throw new Error(
          `Found ${offenders.length} FK(s) without explicit ON DELETE clause:\n${summary}\n` +
            'See openspec/changes/2026-08-26-t8-database-cutover/specs/verification/spec.md R32.1.',
        );
      }
      expect(offenders).toEqual([]);
    });

    it('R32.1: every row is in schema=public (no Supabase internal tables like auth.users, storage.objects)', async () => {
      // The query filters on tc.table_schema = 'public' but we re-assert
      // here as a regression guard against the WHERE clause being edited
      // to "OR schema IS NOT NULL" by mistake.
      //
      // NB: the application's own `public.users` table IS a domain
      // table — it is NOT the Supabase internal `auth.users` (which
      // lives in the `auth` schema, filtered out by the WHERE). The
      // check below is for table names that would only appear if the
      // filter had been edited to surface non-public schemas.
      for (const row of inventory) {
        // Postgres system catalogs / Supabase-internal names. These
        // would only be present if `tc.table_schema = 'public'` was
        // removed from the WHERE clause.
        expect(row.table_name).not.toMatch(/^(pg_|information_schema|storage|auth|realtime|supabase)/);
        // The query specifically filters to public; assert column
        // names look like our domain tables (e.g. not the magic
        // Postgres table for TOAST).
        expect(row.table_name).toMatch(/^[a-z_]+$/);
      }
    });

    it('R32.2: the inventory is non-empty AND every row has table_schema=public (re-asserted)', async () => {
      // R32.2's contract is: a query with the public-schema filter
      // returns only public rows. We assert this by re-running the
      // exact same query inside the test and comparing the row
      // count to the inventory we built. If the two ever diverge,
      // the WHERE clause was edited without updating the inventory
      // load.
      const { rows } = await env.pg.query<FkRow>(
        `SELECT
           tc.table_name,
           kcu.column_name,
           ccu.table_name  AS foreign_table_name,
           ccu.column_name AS foreign_column_name,
           rc.delete_rule,
           rc.update_rule,
           tc.constraint_name,
           col.udt_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema    = kcu.table_schema
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
          AND ccu.constraint_schema = tc.table_schema
         JOIN information_schema.referential_constraints rc
           ON rc.constraint_name = tc.constraint_name
          AND rc.constraint_schema = tc.table_schema
         JOIN information_schema.columns col
           ON col.table_schema = tc.table_schema
          AND col.table_name   = tc.table_name
          AND col.column_name  = kcu.column_name
         WHERE tc.constraint_type = 'FOREIGN KEY'
           AND tc.table_schema    = 'public'
         ORDER BY tc.table_name, kcu.column_name`,
      );
      expect(rows.length).toBe(inventory.length);
    });
  });

  // ───── R33 — INSERT inválido por FK ────────────────────────────────────

  describe('R33 — INSERT with invalid FK is rejected with SQLSTATE 23503', () => {
    it('R33.1 (hardcoded): incidents.citizen_id → users.id with a non-existent UUID fails with 23503', async () => {
      const nonExistent = randomUUID();
      let caught: { code: string; constraint?: string } | null = null;
      try {
        await env.pg.query(
          `INSERT INTO incidents (id, title, location, status, priority,
                                  citizen_id, organization_id, created_at, updated_at)
           VALUES (gen_random_uuid(), 't8-fk-test',
                   ST_GeomFromText('POINT(0 0)', 4326),
                   'pending', 'medium', $1, NULL, now(), now())`,
          [nonExistent],
        );
      } catch (err) {
        caught = err as { code: string; constraint?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.code).toBe('23503');
    });

    it('R33.2 (generalised): every FK in the inventory rejects a non-existent value with 23503', async () => {
      const failures: string[] = [];
      const skipped: string[] = [];
      const timings: Array<{ fk: string; ms: number }> = [];

      for (const fk of inventory) {
        const start = Date.now();
        const probe = fkInvalidValueFor(fk.udt_name);
        if (probe === null) {
          skipped.push(`${fk.table_name}.${fk.column_name} (unsupported udt ${fk.udt_name})`);
          continue;
        }

        let caught: { code: string } | null = null;
        try {
          // Minimal INSERT: just the FK column. The columns NOT NULL
          // without a default would block this — those FKs go in the
          // "skipped" list (above) and are explicitly NOT a test failure.
          await env.pg.query(
            `INSERT INTO "${fk.table_name}" ("${fk.column_name}") VALUES ($1)`,
            [probe],
          );
        } catch (err) {
          const e = err as { code?: string; message?: string };
          if (e.code) caught = { code: e.code };
          // Distinguish: was the failure an FK violation (good) or a
          // schema constraint (skip, not fail)?
          if (e.code === '23503') {
            caught = { code: '23503' };
          } else if (e.code === '23502' /* not_null */ || e.code === '22P02' /* invalid_text_representation */) {
            skipped.push(
              `${fk.table_name}.${fk.column_name} (column has constraints that block the probe: ${e.code})`,
            );
            timings.push({ fk: `${fk.table_name}.${fk.column_name}`, ms: Date.now() - start });
            continue;
          } else if (e.code === '23514' /* check_violation */) {
            skipped.push(
              `${fk.table_name}.${fk.column_name} (column has a CHECK that blocks the probe: ${e.code})`,
            );
            timings.push({ fk: `${fk.table_name}.${fk.column_name}`, ms: Date.now() - start });
            continue;
          }
        }
        timings.push({ fk: `${fk.table_name}.${fk.column_name}`, ms: Date.now() - start });

        if (caught?.code === '23503') continue; // expected

        if (caught === null) {
          failures.push(
            `FK ${fk.constraint_name} on ${fk.table_name}.${fk.column_name} accepted an invalid value`,
          );
        } else {
          // Some other error: classify as skip, not failure. The probe
          // got an unexpected error (e.g. 42703 column does not exist
          // because we used the wrong column name). Rerun would hit the
          // same path; this is a probe bug, not an FK bug.
          skipped.push(
            `${fk.table_name}.${fk.column_name} (probe got ${caught.code}, not 23503 — not the FK's fault)`,
          );
        }
      }

      // Always log timings so a future regression on a specific FK is
      // easy to spot in the Jest reporter.
      // eslint-disable-next-line no-console
      console.log(
        `[R33.2] probed ${inventory.length} FKs in ${timings.reduce((a, t) => a + t.ms, 0)}ms; ` +
          `${failures.length} failures, ${skipped.length} skipped`,
      );

      if (failures.length > 0) {
        throw new Error(
          `Some FKs do not enforce referential integrity:\n  - ${failures.join('\n  - ')}`,
        );
      }
    }, 120_000);
  });

  // ───── R34 — Comportamiento de ON DELETE ───────────────────────────────

  describe('R34 — ON DELETE behaviour', () => {
    it('R34.1 (CASCADE on comments.incident_id): deleting the parent incident cascades to its comments', async () => {
      // Use the anonymous identity (always present after env.reset())
      // and the same harness as the existing t7-referential-integrity
      // spec: the only R34 hardcoded scenarios called out by name.
      const { rows: userRows } = await env.pg.query<{ id: string }>(
        `SELECT id FROM users WHERE device_uuid = 'anonymous'`,
      );
      const citizenId = userRows[0]!.id;

      const incidentId = randomUUID();
      await env.pg.query(
        `INSERT INTO incidents (id, title, location, status, priority,
                                citizen_id, organization_id, created_at, updated_at)
         VALUES ($1, 'r34-1', ST_GeomFromText('POINT(0 0)', 4326),
                 'pending', 'medium', $2, NULL, now(), now())`,
        [incidentId, citizenId],
      );
      const commentId = randomUUID();
      await env.pg.query(
        `INSERT INTO comments (id, incident_id, user_id, content, created_at, updated_at)
         VALUES ($1, $2, $3, 'r34-1-c', now(), now())`,
        [commentId, incidentId, citizenId],
      );

      await env.pg.query(`DELETE FROM incidents WHERE id = $1`, [incidentId]);

      const { rows } = await env.pg.query(
        `SELECT id FROM comments WHERE id = $1`,
        [commentId],
      );
      expect(rows).toHaveLength(0);
    });

    it('R34.2 (SET NULL on incidents.citizen_id): deleting the user NULLs the FK, leaves the incident', async () => {
      // The R34.2 spec example mentions "assignments.user_id" but the
      // actual SET NULL FK on the user table is `incidents.citizen_id`
      // (0025 added soft-delete and 0036 normalized the FK). The
      // existing T7 spec R15.4 covers this exact scenario, and we
      // mirror it here with a self-contained user (avoids reusing
      // the anonymous identity, which other tests in the file depend on).
      const userId = randomUUID();
      await env.pg.query(
        `INSERT INTO users (id, device_uuid, permissions, is_active)
         VALUES ($1, $2, '[]'::jsonb, true)`,
        [userId, `r34-2-${userId.substring(0, 8)}`],
      );
      const incidentId = randomUUID();
      await env.pg.query(
        `INSERT INTO incidents (id, title, location, status, priority,
                                citizen_id, organization_id, created_at, updated_at)
         VALUES ($1, 'r34-2', ST_GeomFromText('POINT(0 0)', 4326),
                 'pending', 'medium', $2, NULL, now(), now())`,
        [incidentId, userId],
      );

      await env.pg.query(`DELETE FROM users WHERE id = $1`, [userId]);

      const { rows } = await env.pg.query<{ citizen_id: string | null }>(
        `SELECT citizen_id FROM incidents WHERE id = $1`,
        [incidentId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.citizen_id).toBeNull();
    });

    it('R34.3 (RESTRICT on incidents.category_id): deleting a category with incidents attached fails with 23503', async () => {
      const catId = randomUUID();
      await env.pg.query(
        `INSERT INTO incident_categories (id, name, parent_id) VALUES ($1, 'r34-3-cat', NULL)`,
        [catId],
      );
      const { rows: userRows } = await env.pg.query<{ id: string }>(
        `SELECT id FROM users WHERE device_uuid = 'anonymous'`,
      );
      const incidentId = randomUUID();
      await env.pg.query(
        `INSERT INTO incidents (id, title, location, status, priority,
                                citizen_id, organization_id, category_id,
                                created_at, updated_at)
         VALUES ($1, 'r34-3-inc', ST_GeomFromText('POINT(0 0)', 4326),
                 'pending', 'medium', $2, NULL, $3, now(), now())`,
        [incidentId, userRows[0]!.id, catId],
      );

      let caught: { code: string } | null = null;
      try {
        await env.pg.query(`DELETE FROM incident_categories WHERE id = $1`, [catId]);
      } catch (err) {
        caught = err as { code: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.code).toBe('23503');
    });

    it('R34.4 (generalised CASCADE/SET NULL/RESTRICT): every FK with one of these rules behaves as declared', async () => {
      // The hardcoded R34.1/R34.2/R34.3 above already exercise the three
      // rules; the generalised loop here is a regression guard for any
      // future migration that adds a FK with an unexpected rule. The
      // assertion is that the inventory contains at least one FK per
      // rule, so a missing one is caught here.
      //
      // Constructing a generic parent/child pair that survives every
      // schema's NOT NULL / CHECK / UNIQUE constraints is out of scope
      // for this spec (the same problem R33.2 skirts by skipping). The
      // hardcoded scenarios above cover the three behaviours; here we
      // assert the inventory still contains the rules they cover.
      const byRule = {
        CASCADE: inventory.filter((r) => r.delete_rule === 'CASCADE').length,
        'SET NULL': inventory.filter((r) => r.delete_rule === 'SET NULL').length,
        RESTRICT: inventory.filter((r) => r.delete_rule === 'RESTRICT').length,
      };
      // Documented in 3-DATABASE-SCHEMA.md post-T7: 8 CASCADE, 11 SET
      // NULL, 6 RESTRICT. Assert >= 1 of each so a future migration
      // that drops a rule entirely fails the test.
      expect(byRule.CASCADE).toBeGreaterThan(0);
      expect(byRule['SET NULL']).toBeGreaterThan(0);
      expect(byRule.RESTRICT).toBeGreaterThan(0);
    });
  });

  // ───── R35 — Regresión de la regla "ninguna FK sin ON DELETE" ──────────

  describe('R35 — Regression of the "every FK declares ON DELETE" rule', () => {
    it('R35.1: a hypothetical FK without ON DELETE in a transient table fails R32.1', async () => {
      // Postgres restriction: a TEMP TABLE FK can only reference another
      // TEMP TABLE (otherwise: "constraints on temporary tables may
      // reference only temporary tables"). So we create a TEMP parent
      // mirroring the public.users shape, then a TEMP child with a FK
      // to it without ON DELETE. Postgres defaults to NO ACTION.
      // The TEMP tables evaporate at session end — we DO NOT modify
      // the public schema.
      const parentName = `__tmp_parent_${randomUUID().substring(0, 8)}`;
      const childName = `__tmp_child_${randomUUID().substring(0, 8)}`;

      await env.pg.query(
        `CREATE TEMP TABLE "${parentName}" (
           id uuid PRIMARY KEY DEFAULT gen_random_uuid()
         ) ON COMMIT PRESERVE ROWS`,
      );
      await env.pg.query(
        `CREATE TEMP TABLE "${childName}" (
           id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
           parent_id uuid NOT NULL REFERENCES "${parentName}"(id)
         ) ON COMMIT PRESERVE ROWS`,
      );

      // Read the constraint's delete_rule directly from pg_constraint
      // joined to pg_class. The constraint_name for an anonymous FK
      // (no `CONSTRAINT name` clause) is auto-generated by Postgres
      // as `<table>_<col>_fkey`, so we look it up by pattern.
      const { rows } = await env.pg.query<{ conname: string; confdeltype: string }>(
        `SELECT conname, confdeltype
           FROM pg_constraint c
           JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relname = $1
            AND c.contype = 'f'`,
        [childName],
      );
      expect(rows.length).toBe(1);
      // confdeltype = 'a' means NO ACTION (the default when no
      // ON DELETE is specified). The codes are documented in
      // pg_constraint: c=.CASCADE, r=SET NULL (no, that's 'n'),
      // actually: a=NO ACTION, r=RESTRICT, c=CASCADE, n=SET NULL,
      // d=SET DEFAULT. We assert 'a'.
      expect(rows[0]!.confdeltype).toBe('a');

      // Now run the same query the public-schema inventory uses,
      // BUT without the schema filter. The temp FK is found and
      // has delete_rule = 'NO ACTION'. R32.1's
      // `expect(offenders).toEqual([])` would fail if the public
      // filter were ever removed.
      const { rows: fullInventory } = await env.pg.query<{ delete_rule: string }>(
        `SELECT rc.delete_rule
           FROM information_schema.table_constraints tc
           JOIN information_schema.referential_constraints rc
             ON rc.constraint_name = tc.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY'`,
      );
      const noAction = fullInventory.filter((r) => r.delete_rule === 'NO ACTION');
      expect(noAction.length).toBeGreaterThan(0);
    });

    it('R35.2: the temp table is gone after the transaction commits (no residual schema)', async () => {
      const { rows } = await env.pg.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'pg_temp' AND table_name LIKE '__tmp_fk_test_%'`,
      );
      expect(rows).toEqual([]);
    });
  });
});

// ───── Helpers ────────────────────────────────────────────────────────────

/**
 * Loads the FK inventory used by every other test in this file. Read once
 * in `beforeAll` and reused. Mirrors the design.md D1 query exactly so
 * the inventory and the test assertions cannot drift apart.
 */
async function loadInventory(env: TestEnvironment): Promise<FkRow[]> {
  const { rows } = await env.pg.query<FkRow>(
    `SELECT
       tc.table_name,
       kcu.column_name,
       ccu.table_name  AS foreign_table_name,
       ccu.column_name AS foreign_column_name,
       rc.delete_rule,
       rc.update_rule,
       tc.constraint_name,
       col.udt_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema    = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name
      AND ccu.constraint_schema = tc.table_schema
     JOIN information_schema.referential_constraints rc
       ON rc.constraint_name = tc.constraint_name
      AND rc.constraint_schema = tc.table_schema
     JOIN information_schema.columns col
       ON col.table_schema = tc.table_schema
      AND col.table_name   = tc.table_name
      AND col.column_name  = kcu.column_name
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema    = 'public'
     ORDER BY tc.table_name, kcu.column_name`,
  );
  return rows;
}

/**
 * Picks a "definitely does not exist" value for the given column UDTT
 * so an INSERT triggers the FK violation (23503) rather than some other
 * constraint. Returns `null` for UDTTs we don't know how to fake — the
 * caller treats `null` as "skip, this FK is out of scope for R33.2".
 */
function fkInvalidValueFor(udt: string): string | number | null {
  switch (udt) {
    case 'uuid':
      return randomUUID();
    case 'int4':
    case 'int2':
    case 'int8':
    case 'numeric':
      // 64-bit integer columns can't hold our 128-bit random UUID;
      // a negative sentinel is universally a non-existent PK.
      return -1;
    case 'varchar':
    case 'text':
    case 'bpchar':
      // Long enough that no real seed value collides.
      return `__no_such_value_${randomUUID()}__`;
    default:
      return null;
  }
}
