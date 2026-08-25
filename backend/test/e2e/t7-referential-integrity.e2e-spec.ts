import { randomUUID } from 'crypto';
import request from 'supertest';
import { TestEnvironment } from '../support/test-environment';

/**
 * T7.7 — referential integrity (0036): leaf-category trigger (R14.1–R14.4)
 * and FK `ON DELETE` normalization (R15.1–R15.4).
 */
describe('E2E T7.7 referential integrity (0036)', () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
    await env.pg.query(`DELETE FROM organizations`);
  });

  async function insertCategory(
    name: string,
    parentId: string | null,
    deletedAt: Date | null = null,
  ): Promise<string> {
    const id = randomUUID();
    await env.pg.query(
      `INSERT INTO incident_categories (id, name, parent_id, deleted_at) VALUES ($1, $2, $3, $4)`,
      [id, name, parentId, deletedAt],
    );
    return id;
  }

  async function createIncidentViaApi(auth: Record<string, string>): Promise<string> {
    const res = await request(env.httpServer)
      .post('/api/incidents')
      .set(auth)
      .send({ title: 'Bache', description: 'En la via', lat: -2.2, lng: -80.5 })
      .expect(201);
    return res.body.id as string;
  }

  async function anonymousAuth(): Promise<Record<string, string>> {
    const login = await request(env.httpServer)
      .post('/api/auth/login')
      .send({ device_uuid: 'anonymous' })
      .expect(200);
    return { Authorization: `Bearer ${login.body.access_token as string}` };
  }

  // ---- R14 — leaf-category trigger --------------------------------------

  describe('R14 — leaf-category trigger', () => {
    it('R14.1: check_is_leaf_category() and its BEFORE INSERT OR UPDATE trigger on incidents exist', async () => {
      const { rows: fnRows } = await env.pg.query(
        `SELECT proname FROM pg_proc WHERE proname = 'check_is_leaf_category'`,
      );
      expect(fnRows).toHaveLength(1);

      const { rows: trgRows } = await env.pg.query<{ tgname: string; tgtype: number }>(
        `SELECT tgname, tgtype FROM pg_trigger
         WHERE tgrelid = 'incidents'::regclass AND NOT tgisinternal
           AND tgname ILIKE '%leaf_category%'`,
      );
      expect(trgRows).toHaveLength(1);
    });

    it('R14.2: an incident in a leaf category (no children) is accepted', async () => {
      const auth = await anonymousAuth();
      const leafId = await insertCategory('Bacheo', null);
      const incidentId = await createIncidentViaApi(auth);

      await expect(
        env.pg.query(`UPDATE incidents SET category_id = $1 WHERE id = $2`, [leafId, incidentId]),
      ).resolves.toBeDefined();
    });

    it('R14.3: an incident in a category that has children is rejected at the DB level and translated to 400 via PATCH /api/incidents/:id', async () => {
      const auth = await anonymousAuth();
      const parentId = await insertCategory('Infraestructura Vial', null);
      await insertCategory('Baches', parentId);
      const incidentId = await createIncidentViaApi(auth);

      // DB-level: raw SQL hits the trigger directly.
      await expect(
        env.pg.query(`UPDATE incidents SET category_id = $1 WHERE id = $2`, [
          parentId,
          incidentId,
        ]),
      ).rejects.toThrow(/INCIDENT_CATEGORY_NOT_LEAF/);

      // API-level: the same violation is translated to 400.
      const operator = await env.provisionUser(['UPDATE incidents']);
      const res = await request(env.httpServer)
        .patch(`/api/incidents/${incidentId}`)
        .set({ Authorization: `Bearer ${operator.accessToken}` })
        .send({ category_id: parentId })
        .expect(400);

      expect(res.body.message).toMatch(/not.*leaf|leaf.*categor/i);
    });

    it('R14.4: a soft-deleted only-child does not turn its parent into a non-leaf', async () => {
      const auth = await anonymousAuth();
      const parentId = await insertCategory('Seguridad Ciudadana', null);
      await insertCategory('Robos', parentId, new Date());
      const incidentId = await createIncidentViaApi(auth);

      await expect(
        env.pg.query(`UPDATE incidents SET category_id = $1 WHERE id = $2`, [
          parentId,
          incidentId,
        ]),
      ).resolves.toBeDefined();
    });
  });

  // ---- R15 — FK ON DELETE behaviour --------------------------------------

  describe('R15 — FK ON DELETE behaviour', () => {
    it('R15.1: no domain-table FK is left on the implicit NO ACTION default', async () => {
      const { rows } = await env.pg.query<{
        table_name: string;
        column_name: string;
        delete_rule: string;
      }>(
        `SELECT tc.table_name, kcu.column_name, rc.delete_rule
           FROM information_schema.table_constraints tc
           JOIN information_schema.referential_constraints rc
             ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`,
      );

      expect(rows.length).toBeGreaterThan(0);
      const noAction = rows.filter((r) => r.delete_rule === 'NO ACTION');
      expect(noAction).toEqual([]);
    });

    it('R15.2: physically deleting an incident cascades comments, images, assignments and status_history', async () => {
      const auth = await anonymousAuth();
      const incidentId = await createIncidentViaApi(auth);

      await request(env.httpServer)
        .post(`/api/comments`)
        .set(auth)
        .send({ incident_id: incidentId, content: 'Un comentario' })
        .expect(201);

      const { rows: userRows } = await env.pg.query<{ id: string }>(
        `SELECT id FROM users WHERE device_uuid = 'anonymous'`,
      );
      await env.pg.query(
        `INSERT INTO assignments (id, incident_id, operator_id) VALUES ($1, $2, $3)`,
        [randomUUID(), incidentId, userRows[0].id],
      );
      await env.pg.query(
        `INSERT INTO status_history (id, incident_id, changed_by_user_id, previous_status, new_status, event_id)
         VALUES ($1, $2, $3, 'pending', 'in_progress', $4)`,
        [randomUUID(), incidentId, userRows[0].id, randomUUID()],
      );

      await env.pg.query(`DELETE FROM incidents WHERE id = $1`, [incidentId]);

      const { rows: commentRows } = await env.pg.query(
        `SELECT id FROM comments WHERE incident_id = $1`,
        [incidentId],
      );
      const { rows: assignmentRows } = await env.pg.query(
        `SELECT id FROM assignments WHERE incident_id = $1`,
        [incidentId],
      );
      const { rows: historyRows } = await env.pg.query(
        `SELECT id FROM status_history WHERE incident_id = $1`,
        [incidentId],
      );
      expect(commentRows).toHaveLength(0);
      expect(assignmentRows).toHaveLength(0);
      expect(historyRows).toHaveLength(0);
    });

    it('R15.3: physically deleting an organization with incidents is rejected (RESTRICT)', async () => {
      const orgId = randomUUID();
      await env.pg.query(`INSERT INTO organizations (id, name, zone_id) VALUES ($1, $2, NULL)`, [
        orgId,
        'Org con incidentes',
      ]);
      const auth = await anonymousAuth();
      const incidentId = await createIncidentViaApi(auth);
      await env.pg.query(`UPDATE incidents SET organization_id = $1 WHERE id = $2`, [
        orgId,
        incidentId,
      ]);

      await expect(
        env.pg.query(`DELETE FROM organizations WHERE id = $1`, [orgId]),
      ).rejects.toThrow(/foreign key|violates/i);
    });

    it('R15.4: physically deleting a user leaves their incidents with citizen_id NULL', async () => {
      const auth = await anonymousAuth();
      const incidentId = await createIncidentViaApi(auth);
      const { rows: userRows } = await env.pg.query<{ id: string }>(
        `SELECT id FROM users WHERE device_uuid = 'anonymous'`,
      );
      const citizenId = userRows[0].id;

      await env.pg.query(`DELETE FROM users WHERE id = $1`, [citizenId]);

      const { rows: incidentRows } = await env.pg.query<{ citizen_id: string | null }>(
        `SELECT citizen_id FROM incidents WHERE id = $1`,
        [incidentId],
      );
      expect(incidentRows).toHaveLength(1);
      expect(incidentRows[0].citizen_id).toBeNull();
    });
  });
});
