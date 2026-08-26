import { randomUUID } from 'crypto';
import request from 'supertest';
import { TestEnvironment } from '../support/test-environment';

/**
 * T7.5 — organizations hierarchy (parent_id) + category-based routing
 * (0034). R10.1–R10.3, R11.1–R11.10.
 *
 * R10.4/R10.5 (from the original spec draft) described a PARTIAL
 * `UNIQUE (zone_id) WHERE parent_id IS NULL` — superseded by the design
 * correction (design.md D7, Hallazgo 4): `uq_organizations_zone` is
 * removed ENTIRELY, not made partial (matches R11.1/R11.2 and
 * tasks.md T7.5.A2b literally: "no alcanza con hacerlo parcial por
 * parent_id"). This file tests the corrected, authoritative behaviour —
 * see the apply-progress report for the documented spec inconsistency.
 */
describe('E2E T7.5 organizations hierarchy + category routing (0034)', () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
    // `organizations` is NOT truncated by env.reset() — keep this suite's
    // fixtures isolated from t6-organizations-notified.e2e-spec.ts and
    // across it's own tests.
    await env.pg.query(`DELETE FROM organizations`);
  });

  async function insertZone(
    id: string,
    name: string,
    level: 'provincia' | 'canton' | 'parroquia',
    parentId: string | null,
  ): Promise<void> {
    await env.pg.query(
      `INSERT INTO geo_zones (id, name, polygon, level, parent_id)
       VALUES ($1, $2, ST_Multi(ST_MakeEnvelope(-81, -3, -80, -2, 4326)), $3, $4)`,
      [id, name, level, parentId],
    );
  }

  async function insertCategory(id: string, name: string, parentId: string | null): Promise<void> {
    await env.pg.query(
      `INSERT INTO incident_categories (id, name, parent_id) VALUES ($1, $2, $3)`,
      [id, name, parentId],
    );
  }

  async function insertOrg(overrides: {
    id?: string;
    name: string;
    zoneId: string | null;
    parentId?: string | null;
    incidentCategoryId?: string | null;
    deletedAt?: Date | null;
  }): Promise<string> {
    const id = overrides.id ?? randomUUID();
    await env.pg.query(
      `INSERT INTO organizations (id, name, zone_id, parent_id, incident_category_id, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        overrides.name,
        overrides.zoneId,
        overrides.parentId ?? null,
        overrides.incidentCategoryId ?? null,
        overrides.deletedAt ?? null,
      ],
    );
    return id;
  }

  // ---- R10.1 — Columna y FK creadas ------------------------------------

  it('R10.1: organizations.parent_id exists with FK ON DELETE SET NULL', async () => {
    const { rows: colRows } = await env.pg.query(
      `SELECT is_nullable, data_type FROM information_schema.columns
       WHERE table_name = 'organizations' AND column_name = 'parent_id'`,
    );
    expect(colRows).toHaveLength(1);
    expect(colRows[0].is_nullable).toBe('YES');

    const { rows: fkRows } = await env.pg.query(
      `SELECT confdeltype FROM pg_constraint
       WHERE conrelid = 'organizations'::regclass AND contype = 'f'
         AND confrelid = 'organizations'::regclass`,
    );
    expect(fkRows).toHaveLength(1);
    expect(fkRows[0].confdeltype).toBe('n'); // 'n' = SET NULL
  });

  // ---- R10.3 — Ciclo directo rechazado ---------------------------------

  it('R10.3: setting parent_id = own id violates the CHECK constraint', async () => {
    const orgId = await insertOrg({ name: 'Org O', zoneId: null });

    await expect(
      env.pg.query(`UPDATE organizations SET parent_id = $1 WHERE id = $1`, [orgId]),
    ).rejects.toThrow(/chk_organizations_no_self_parent|check constraint/i);
  });

  // ---- R10.2 — El árbol refleja la jerarquía ---------------------------

  it('R10.2: GET /organizations/tree nests two children under their parent', async () => {
    const user = await env.provisionUser(['READ organizations']);
    const auth = { Authorization: `Bearer ${user.accessToken}` };

    const parentId = await insertOrg({ name: 'Parent P', zoneId: null });
    const child1Id = await insertOrg({ name: 'Child H1', zoneId: null, parentId });
    const child2Id = await insertOrg({ name: 'Child H2', zoneId: null, parentId });

    const res = await request(env.httpServer).get('/api/organizations/tree').set(auth).expect(200);

    const parentNode = (res.body as Array<{ id: string; children: Array<{ id: string }> }>).find(
      (n) => n.id === parentId,
    );
    expect(parentNode).toBeDefined();
    expect(parentNode!.children.map((c) => c.id).sort()).toEqual([child1Id, child2Id].sort());
  });

  // ---- R11.1 — Columna y FK creadas; UNIQUE eliminado -------------------

  it('R11.1: incident_category_id exists with FK, uq_organizations_zone is gone', async () => {
    const { rows: colRows } = await env.pg.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'organizations' AND column_name = 'incident_category_id'`,
    );
    expect(colRows).toHaveLength(1);
    expect(colRows[0].is_nullable).toBe('YES');

    const { rows: idxRows } = await env.pg.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'organizations' AND indexname = 'uq_organizations_zone'`,
    );
    expect(idxRows).toHaveLength(0);
  });

  // ---- R11.2 — Varias organizaciones por zona son válidas --------------

  it('R11.2: two distinct organizations with the same zone_id both insert successfully', async () => {
    const zoneId = randomUUID();
    await insertZone(zoneId, 'Zona X', 'parroquia', null);

    await expect(insertOrg({ name: 'Org A', zoneId })).resolves.toBeDefined();
    await expect(insertOrg({ name: 'Org B', zoneId })).resolves.toBeDefined();
  });

  // ---- R11.3–R11.10 — notified-for routing -----------------------------

  describe('notified-for routing (R11.3–R11.10)', () => {
    // Fresh per test (env.reset() does not truncate geo_zones/incident_categories).
    let PROVINCE_ID: string;
    let CANTON_ID: string;
    let PARROQUIA_ID: string;
    let ROOT_CATEGORY_ID: string;
    let SUB_CATEGORY_ID: string;
    let OTHER_ROOT_CATEGORY_ID: string;

    beforeEach(async () => {
      // 3-level zone tree: province -> canton -> parroquia
      PROVINCE_ID = randomUUID();
      CANTON_ID = randomUUID();
      PARROQUIA_ID = randomUUID();
      // 2-level category tree: root -> subcategory
      ROOT_CATEGORY_ID = randomUUID();
      SUB_CATEGORY_ID = randomUUID();
      OTHER_ROOT_CATEGORY_ID = randomUUID();

      await insertZone(PROVINCE_ID, 'Santa Elena', 'provincia', null);
      await insertZone(CANTON_ID, 'La Libertad', 'canton', PROVINCE_ID);
      await insertZone(PARROQUIA_ID, 'Ballenita', 'parroquia', CANTON_ID);

      await insertCategory(ROOT_CATEGORY_ID, 'Infraestructura Vial', null);
      await insertCategory(SUB_CATEGORY_ID, 'Baches y Hundimientos', ROOT_CATEGORY_ID);
      await insertCategory(OTHER_ROOT_CATEGORY_ID, 'Seguridad Ciudadana', null);
    });

    async function notifiedFor(zoneId: string, categoryId: string, auth: Record<string, string>) {
      return request(env.httpServer)
        .get(`/api/organizations/notified-for?location_id=${zoneId}&category_id=${categoryId}`)
        .set(auth)
        .expect(200);
    }

    it('R11.3: an org registered at the province is notified for an incident in a descendant parroquia', async () => {
      const user = await env.provisionUser([]);
      const auth = { Authorization: `Bearer ${user.accessToken}` };
      const orgId = await insertOrg({ name: 'Org Provincia', zoneId: PROVINCE_ID });

      const res = await notifiedFor(PARROQUIA_ID, SUB_CATEGORY_ID, auth);

      expect((res.body as Array<{ id: string }>).map((o) => o.id)).toContain(orgId);
    });

    it('R11.4: an org registered for the root category covers the subcategory', async () => {
      const user = await env.provisionUser([]);
      const auth = { Authorization: `Bearer ${user.accessToken}` };
      const orgId = await insertOrg({
        name: 'Org Categoria Raiz',
        zoneId: PARROQUIA_ID,
        incidentCategoryId: ROOT_CATEGORY_ID,
      });

      const res = await notifiedFor(PARROQUIA_ID, SUB_CATEGORY_ID, auth);

      expect((res.body as Array<{ id: string }>).map((o) => o.id)).toContain(orgId);
    });

    it('R11.5: an org with incident_category_id NULL (transversal) is notified for any category', async () => {
      const user = await env.provisionUser([]);
      const auth = { Authorization: `Bearer ${user.accessToken}` };
      const orgId = await insertOrg({
        name: 'Org Transversal',
        zoneId: PARROQUIA_ID,
        incidentCategoryId: null,
      });

      const res = await notifiedFor(PARROQUIA_ID, OTHER_ROOT_CATEGORY_ID, auth);

      expect((res.body as Array<{ id: string }>).map((o) => o.id)).toContain(orgId);
    });

    it('R11.6: an org configured for a different category is NOT notified', async () => {
      const user = await env.provisionUser([]);
      const auth = { Authorization: `Bearer ${user.accessToken}` };
      const orgId = await insertOrg({
        name: 'Org Medio Ambiente',
        zoneId: PARROQUIA_ID,
        incidentCategoryId: OTHER_ROOT_CATEGORY_ID,
      });

      const res = await notifiedFor(PARROQUIA_ID, SUB_CATEGORY_ID, auth);

      expect((res.body as Array<{ id: string }>).map((o) => o.id)).not.toContain(orgId);
    });

    it('R11.7: exactly one org has is_claimable=true — the first in stable (created_at, id) order', async () => {
      const user = await env.provisionUser([]);
      const auth = { Authorization: `Bearer ${user.accessToken}` };

      const org1 = await insertOrg({ name: 'Org 1', zoneId: PARROQUIA_ID });
      await new Promise((r) => setTimeout(r, 20));
      await insertOrg({ name: 'Org 2', zoneId: PARROQUIA_ID });
      await new Promise((r) => setTimeout(r, 20));
      await insertOrg({ name: 'Org 3', zoneId: PARROQUIA_ID });

      const res = await notifiedFor(PARROQUIA_ID, SUB_CATEGORY_ID, auth);
      const body = res.body as Array<{ id: string; is_claimable: boolean }>;

      expect(body.filter((o) => o.is_claimable)).toHaveLength(1);
      expect(body.find((o) => o.is_claimable)!.id).toBe(org1);
    });

    it('R11.8: no organization covers the pair → 200 with an empty array', async () => {
      const user = await env.provisionUser([]);
      const auth = { Authorization: `Bearer ${user.accessToken}` };

      const res = await notifiedFor(PARROQUIA_ID, SUB_CATEGORY_ID, auth);

      expect(res.body).toEqual([]);
    });

    it('R11.9: a soft-deleted organization that would otherwise match is excluded', async () => {
      const user = await env.provisionUser([]);
      const auth = { Authorization: `Bearer ${user.accessToken}` };
      const orgId = await insertOrg({
        name: 'Org Borrada',
        zoneId: PARROQUIA_ID,
        deletedAt: new Date(),
      });

      const res = await notifiedFor(PARROQUIA_ID, SUB_CATEGORY_ID, auth);

      expect((res.body as Array<{ id: string }>).map((o) => o.id)).not.toContain(orgId);
    });

    it('R11.10: the order is stable across repeated calls', async () => {
      const user = await env.provisionUser([]);
      const auth = { Authorization: `Bearer ${user.accessToken}` };

      await insertOrg({ name: 'Org 1', zoneId: PARROQUIA_ID });
      await insertOrg({ name: 'Org 2', zoneId: PARROQUIA_ID });
      await insertOrg({ name: 'Org 3', zoneId: PARROQUIA_ID });

      const res1 = await notifiedFor(PARROQUIA_ID, SUB_CATEGORY_ID, auth);
      const res2 = await notifiedFor(PARROQUIA_ID, SUB_CATEGORY_ID, auth);

      expect((res1.body as Array<{ id: string }>).map((o) => o.id)).toEqual(
        (res2.body as Array<{ id: string }>).map((o) => o.id),
      );
    });
  });
});
