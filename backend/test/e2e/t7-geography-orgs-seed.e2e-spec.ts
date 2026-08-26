import { randomUUID } from 'crypto';

import { MigrationHarness } from '../support/migration-harness';
import { rollbackPathFor, listMigrations } from '../../scripts/lib/migration-files';

/**
 * T7.9.C4 — migración 0041 (geografía de Santa Elena + organización semilla).
 * Ejercita R21.0–R21.5 (specs/database-schema/spec.md) contra Postgres real
 * vía `MigrationHarness` — controla exactamente qué rango de migraciones se
 * aplica (design.md D4/D5), nunca fixtures `ST_MakeEnvelope`: R21.3 sólo es
 * significativo contra la geometría real de INEC/OSM.
 *
 * `OVERLAP_MIN = 0.75` está fijado por debajo del mínimo medido el
 * 2026-08-25 (0.8058, Anconcito — ver database/data/README.md), con margen
 * deliberado: detecta corrupción gruesa de geometría, no desacuerdo de
 * bordes entre fuentes distintas (parroquias de OSM, cantones de la
 * migración inmutable 0003).
 */
describe('T7.9.C4 — geography + organizations seed (migración 0041)', () => {
  let db: MigrationHarness;

  const SEEDED_IDS = {
    province: '8f14e45f-ceea-4c1f-8f2c-000000000024',
    santaElena: '8f14e45f-ceea-4c1f-8f2c-000000000101',
    laLibertad: '8f14e45f-ceea-4c1f-8f2c-000000000102',
    salinas: '8f14e45f-ceea-4c1f-8f2c-000000000103',
  };

  const OVERLAP_MIN = 0.75;

  beforeAll(async () => {
    db = await MigrationHarness.start();
    await db.applyRange({ to: '0041' });
  }, 180_000);

  afterAll(async () => {
    await db.stop();
  });

  it('R21.0 — el backfill de code precede a las parroquias: las 4 geo_zones preexistentes quedan con code', async () => {
    const rows = await db.rows<{ id: string; code: string | null }>(
      `SELECT id, code FROM geo_zones WHERE id IN ($1, $2, $3, $4)`,
      [SEEDED_IDS.province, SEEDED_IDS.santaElena, SEEDED_IDS.laLibertad, SEEDED_IDS.salinas],
    );

    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.code).not.toBeNull();
    }

    const byId = Object.fromEntries(rows.map((r) => [r.id, r.code]));
    expect(byId[SEEDED_IDS.province]).toBe('EC-24');
    expect(byId[SEEDED_IDS.santaElena]).toBe('EC-24-01');
    expect(byId[SEEDED_IDS.laLibertad]).toBe('EC-24-02');
    expect(byId[SEEDED_IDS.salinas]).toBe('EC-24-03');
  });

  it('R21.1 — las parroquias de Santa Elena quedan sembradas, al menos una por cantón', async () => {
    const rows = await db.rows<{ canton_code: string; parroquia_count: string }>(
      `SELECT p.code AS canton_code, count(z.id)::text AS parroquia_count
         FROM geo_zones p
         LEFT JOIN geo_zones z ON z.parent_id = p.id AND z.level = 'parroquia'
        WHERE p.code IN ('EC-24-01', 'EC-24-02', 'EC-24-03')
        GROUP BY p.code`,
    );

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(Number(row.parroquia_count)).toBeGreaterThanOrEqual(1);
    }

    const invalid = await db.rows<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM geo_zones
        WHERE level = 'parroquia'
          AND (code IS NULL OR polygon IS NULL OR parent_id IS NULL OR NOT ST_IsValid(polygon))`,
    );
    expect(Number(invalid[0].count)).toBe(0);
  });

  it('R21.2 — la jerarquía geográfica es consistente: parroquia -> cantón -> provincia, sin ciclos', async () => {
    const parroquias = await db.rows<{ id: string; parent_id: string }>(
      `SELECT id, parent_id FROM geo_zones WHERE level = 'parroquia'`,
    );
    expect(parroquias.length).toBeGreaterThan(0);

    for (const parroquia of parroquias) {
      const [canton] = await db.rows<{ level: string; parent_id: string | null }>(
        `SELECT level, parent_id FROM geo_zones WHERE id = $1`,
        [parroquia.parent_id],
      );
      expect(canton).toBeDefined();
      expect(canton.level).toBe('canton');
      expect(canton.parent_id).not.toBeNull();

      const [provincia] = await db.rows<{ level: string; parent_id: string | null; id: string }>(
        `SELECT id, level, parent_id FROM geo_zones WHERE id = $1`,
        [canton.parent_id as string],
      );
      expect(provincia).toBeDefined();
      expect(provincia.level).toBe('provincia');
      expect(provincia.parent_id).toBeNull();
      // No ciclos: la provincia no puede ser la propia parroquia ni el cantón.
      expect(provincia.id).not.toBe(parroquia.id);
    }
  });

  it('R21.3 — el punto interior de cada parroquia cae en su cantón (parent_ok) con overlap_ratio >= OVERLAP_MIN, sin editar geometría', async () => {
    const rows = await db.rows<{
      code: string;
      parent_ok: boolean;
      overlap_ratio: string | null;
    }>(
      `SELECT
          z.code,
          ST_Within(ST_PointOnSurface(z.polygon), c.polygon) AS parent_ok,
          (ST_Area(ST_Intersection(z.polygon, c.polygon)::geography)
            / NULLIF(ST_Area(z.polygon::geography), 0))::text AS overlap_ratio
         FROM geo_zones z
         JOIN geo_zones c ON c.id = z.parent_id
        WHERE z.level = 'parroquia'`,
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.parent_ok).toBe(true);
      expect(row.overlap_ratio).not.toBeNull();
      expect(Number(row.overlap_ratio)).toBeGreaterThanOrEqual(OVERLAP_MIN);
    }
  });

  it('R21.4 — la organización CTE - Santa Elena existe una sola vez, con zone_id -> EC-24-01 y parent_id NULL', async () => {
    const rows = await db.rows<{ id: string; zone_id: string | null; parent_id: string | null }>(
      `SELECT id, zone_id, parent_id FROM organizations WHERE name = 'CTE - Santa Elena'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].parent_id).toBeNull();
    expect(rows[0].zone_id).not.toBeNull();

    const [zone] = await db.rows<{ code: string }>(`SELECT code FROM geo_zones WHERE id = $1`, [
      rows[0].zone_id as string,
    ]);
    expect(zone.code).toBe('EC-24-01');
  });

  it('R21.5 — re-aplicar 0041 no cambia los conteos de geo_zones ni organizations', async () => {
    const [before] = await db.rows<{ geo: string; orgs: string }>(
      `SELECT (SELECT count(*) FROM geo_zones)::text AS geo,
              (SELECT count(*) FROM organizations)::text AS orgs`,
    );

    await db.applyVersion('0041');

    const [after] = await db.rows<{ geo: string; orgs: string }>(
      `SELECT (SELECT count(*) FROM geo_zones)::text AS geo,
              (SELECT count(*) FROM organizations)::text AS orgs`,
    );

    expect(after.geo).toBe(before.geo);
    expect(after.orgs).toBe(before.orgs);
  });
});

/**
 * T7.9.C6/C7 — rollback ciclo completo (design.md D6). Mismo `MigrationHarness`
 * pattern que `backend/test/migrations/rollback-cycle.e2e-spec.ts`. Tests
 * ordenados deliberadamente: primero el guard (no muta estado permanente, se
 * limpia en el propio test), luego el DOWN real al final del archivo — deja
 * la base sin las filas de 0041, así que debe ser el último consumidor del
 * harness compartido.
 */
describe('T7.9.C6/C7 — 0041 rollback: guard ruidoso, orden inverso, sin residuos', () => {
  let db: MigrationHarness;
  const downPath = rollbackPathFor(listMigrations().find((m) => m.version === '0041')!)!;

  beforeAll(async () => {
    db = await MigrationHarness.start();
    await db.applyRange({ to: '0041' });
  }, 180_000);

  afterAll(async () => {
    await db.stop();
  });

  it('0041_geography_organizations_seed.DOWN.sql existe', () => {
    expect(downPath).toBeTruthy();
  });

  it('el DOWN aborta ruidosamente si un usuario aún referencia CTE - Santa Elena', async () => {
    const [org] = await db.rows<{ id: string }>(
      `SELECT id FROM organizations WHERE name = 'CTE - Santa Elena'`,
    );
    const deviceUuid = `t7-c6-guard-${randomUUID()}`;

    await db.client.query(
      `INSERT INTO users (device_uuid, permissions, is_active, organization_id)
       VALUES ($1, '[]'::jsonb, true, $2)`,
      [deviceUuid, org.id],
    );

    await expect(db.applyFile(downPath)).rejects.toThrow(/cannot rollback 0041/);

    // The file's own BEGIN was issued before the RAISE EXCEPTION aborted
    // the multi-statement simple-protocol query — Postgres leaves the
    // session's transaction "aborted" until an explicit ROLLBACK, since the
    // failed statement never reached the file's own COMMIT.
    await db.client.query('ROLLBACK');

    // Clean up — this test must not leak the referencing user into the
    // suite that actually exercises the successful DOWN below.
    await db.client.query('DELETE FROM users WHERE device_uuid = $1', [deviceUuid]);
  });

  it('el DOWN, en orden inverso y una sola transacción, restaura el estado previo a 0041 sin residuos', async () => {
    await db.applyFile(downPath);

    const orgs = await db.rows<{ count: string }>(
      `SELECT count(*)::text AS count FROM organizations WHERE name = 'CTE - Santa Elena'`,
    );
    expect(Number(orgs[0].count)).toBe(0);

    const parroquias = await db.rows<{ count: string }>(
      `SELECT count(*)::text AS count FROM geo_zones WHERE level = 'parroquia'`,
    );
    expect(Number(parroquias[0].count)).toBe(0);

    const codes = await db.rows<{ code: string | null }>(
      `SELECT code FROM geo_zones WHERE id IN (
         '8f14e45f-ceea-4c1f-8f2c-000000000024',
         '8f14e45f-ceea-4c1f-8f2c-000000000101',
         '8f14e45f-ceea-4c1f-8f2c-000000000102',
         '8f14e45f-ceea-4c1f-8f2c-000000000103'
       )`,
    );
    expect(codes).toHaveLength(4);
    for (const row of codes) {
      expect(row.code).toBeNull();
    }

    // The 4 preexisting province/canton rows themselves must survive — the
    // DOWN only nulls their `code`, it never deletes them (they predate
    // 0041's ownership).
    const survivors = await db.rows<{ count: string }>(
      `SELECT count(*)::text AS count FROM geo_zones WHERE id IN (
         '8f14e45f-ceea-4c1f-8f2c-000000000024',
         '8f14e45f-ceea-4c1f-8f2c-000000000101',
         '8f14e45f-ceea-4c1f-8f2c-000000000102',
         '8f14e45f-ceea-4c1f-8f2c-000000000103'
       )`,
    );
    expect(Number(survivors[0].count)).toBe(4);
  });

  it('re-aplicar 0041 tras el DOWN reconstruye exactamente el mismo estado (ciclo completo)', async () => {
    await db.applyVersion('0041');

    const orgs = await db.rows<{ count: string }>(
      `SELECT count(*)::text AS count FROM organizations WHERE name = 'CTE - Santa Elena'`,
    );
    expect(Number(orgs[0].count)).toBe(1);

    const parroquias = await db.rows<{ count: string }>(
      `SELECT count(*)::text AS count FROM geo_zones WHERE level = 'parroquia'`,
    );
    expect(Number(parroquias[0].count)).toBeGreaterThanOrEqual(3);
  });
});
