import { randomUUID } from 'crypto';
import { TestEnvironment } from '../support/test-environment';

/**
 * T7.8 — index parity (0037). R16.1–R16.3: the 9 legacy-parity indexes
 * exist, none of them duplicate an existing index, and a filtered incidents
 * listing at volume does not fall back to a sequential scan.
 */
describe('E2E T7.8 index parity (0037)', () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
  });

  /** Loose match: does ANY index on `table` cover `column` (as one of its columns)? */
  async function hasIndexOn(table: string, column: string): Promise<boolean> {
    const { rows } = await env.pg.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1`,
      [table],
    );
    const columnRegex = new RegExp(`\\(([^)]*\\b${column}\\b[^)]*)\\)`, 'i');
    return rows.some((r) => columnRegex.test(r.indexdef));
  }

  // ---- R16.1 — the 9 indexes exist ---------------------------------------

  describe('R16.1 — the 9 legacy-parity indexes exist', () => {
    const expected: Array<[string, string]> = [
      ['comments', 'user_id'],
      ['comments', 'parent_id'],
      ['assignments', 'incident_id'],
      ['status_history', 'changed_by_user_id'],
      ['incidents', 'priority'],
      ['incidents', 'citizen_id'],
      ['geo_zones', 'code'],
      ['invitations', 'token_hash'],
      ['password_reset_tokens', 'token_hash'],
    ];

    it.each(expected)('has an index covering %s.%s', async (table, column) => {
      await expect(hasIndexOn(table, column)).resolves.toBe(true);
    });
  });

  // ---- R16.2 — no duplicate indexes ---------------------------------------

  it('R16.2: no two indexes on the same table share the exact same definition (name aside)', async () => {
    const { rows } = await env.pg.query<{ tablename: string; indexdef: string }>(
      `SELECT tablename, indexdef FROM pg_indexes WHERE schemaname = 'public'`,
    );

    const normalized = rows.map((r) => ({
      tablename: r.tablename,
      // Strip the index name only — "CREATE [UNIQUE] INDEX <name> ON ..." ->
      // "CREATE [UNIQUE] INDEX X ON ...". Two indexes with the exact same
      // remaining definition (same columns, same uniqueness, same
      // predicate) are true duplicates; a partial vs. a full index on the
      // same column is NOT (different definition).
      normalizedDef: r.indexdef.replace(/INDEX\s+\S+\s+ON/i, 'INDEX X ON'),
    }));

    const seen = new Map<string, number>();
    for (const row of normalized) {
      const key = `${row.tablename}::${row.normalizedDef}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }

    const duplicates = [...seen.entries()].filter(([, count]) => count > 1);
    expect(duplicates).toEqual([]);
  });

  // ---- R16.3 — filtered incidents listing uses an index -------------------

  it('R16.3: EXPLAIN of the filtered incidents listing (status + organization) does not Seq Scan incidents', async () => {
    const orgId = randomUUID();
    await env.pg.query(`INSERT INTO organizations (id, name, zone_id) VALUES ($1, $2, NULL)`, [
      orgId,
      'Org Volumen',
    ]);
    const { rows: userRows } = await env.pg.query<{ id: string }>(
      `SELECT id FROM users WHERE device_uuid = 'anonymous'`,
    );
    const citizenId = userRows[0].id;

    const TOTAL = 1200;
    const values: string[] = [];
    const params: unknown[] = [];
    for (let i = 0; i < TOTAL; i += 1) {
      const base = params.length;
      values.push(
        `(gen_random_uuid(), $${base + 1}, $${base + 2}, ST_SetSRID(ST_MakePoint(-80.5, -2.2), 4326), $${base + 3}, $${base + 4}, $${base + 5})`,
      );
      params.push(
        `Incidente ${i}`,
        citizenId,
        i % 3 === 0 ? 'pending' : i % 3 === 1 ? 'in_progress' : 'resolved',
        orgId,
        'medium',
      );
    }
    await env.pg.query(
      `INSERT INTO incidents (id, title, citizen_id, location, status, organization_id, priority)
       VALUES ${values.join(', ')}`,
      params,
    );

    const { rows } = await env.pg.query<{ 'QUERY PLAN': string }[]>(
      `EXPLAIN SELECT * FROM incidents
        WHERE status = 'pending' AND organization_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1000`,
      [orgId],
    );
    const plan = (rows as unknown as Array<{ 'QUERY PLAN': string }>)
      .map((r) => r['QUERY PLAN'])
      .join('\n');

    expect(plan).not.toMatch(/Seq Scan on incidents/i);
  });
});
