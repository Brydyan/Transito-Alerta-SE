import { randomUUID } from 'crypto';
import request from 'supertest';
import { ProvisionedUser, TestEnvironment } from '../support/test-environment';

/**
 * T7.2 Fase C — app-level soft delete (R6, R7). Migration 0031 (T7.2 Fase A)
 * added `deleted_at` at the schema level; this file proves the APPLICATION
 * actually honors it: writes go through `UPDATE ... SET deleted_at`, never
 * a real `DELETE`, and reads exclude soft-deleted rows.
 */
describe('E2E T7.2 Fase C — app-level soft delete', () => {
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

  function auth(user: ProvisionedUser) {
    return { Authorization: `Bearer ${user.accessToken}` };
  }

  // ===================================================================
  // R6.3 — soft-deleting a comment does NOT touch its images
  // ===================================================================

  describe('R6.3 — comment_images survive a comment soft-delete', () => {
    async function seedIncident(ownerId: string): Promise<string> {
      const incidentId = randomUUID();
      await env.pg.query(
        `INSERT INTO incidents (id, title, location, status, priority, citizen_id)
         VALUES ($1, 'Test', ST_SetSRID(ST_MakePoint(-80.5, -2.2), 4326), 'pending', 'medium', $2)`,
        [incidentId, ownerId],
      );
      return incidentId;
    }

    it('leaves comment_images rows fully intact — no S3 delete, no cascade', async () => {
      const user = await env.provisionUser(['CREATE comments', 'DELETE comments']);
      const incidentId = await seedIncident(user.userId);

      const commentId = randomUUID();
      await env.pg.query(
        `INSERT INTO comments (id, content, incident_id, user_id) VALUES ($1, 'root', $2, $3)`,
        [commentId, incidentId, user.userId],
      );
      const imageIds = [randomUUID(), randomUUID()];
      for (const imageId of imageIds) {
        await env.pg.query(
          `INSERT INTO comment_images (id, comment_id, storage_key, url, mime_type, file_size)
           VALUES ($1, $2, 'k', 'https://example.com/x.jpg', 'image/jpeg', 100)`,
          [imageId, commentId],
        );
      }

      await request(env.httpServer)
        .delete(`/api/comments/${commentId}`)
        .set(auth(user))
        .expect(204);

      const { rows } = await env.pg.query(
        `SELECT id FROM comment_images WHERE comment_id = $1`,
        [commentId],
      );
      expect(rows.map((r: { id: string }) => r.id).sort()).toEqual(imageIds.sort());
    });
  });

  // ===================================================================
  // R7.1 — soft-deleted notifications excluded from unread-count
  // ===================================================================

  describe('R7.1 — notifications', () => {
    it('a soft-deleted unread notification does not count toward unread_count', async () => {
      const user = await env.provisionUser([]);

      const keptId = randomUUID();
      const deletedId = randomUUID();
      await env.pg.query(
        `INSERT INTO notifications (id, user_id, type, message, read)
         VALUES ($1, $2, 'incident.created', 'kept', false)`,
        [keptId, user.userId],
      );
      await env.pg.query(
        `INSERT INTO notifications (id, user_id, type, message, read)
         VALUES ($1, $2, 'incident.created', 'deleted', false)`,
        [deletedId, user.userId],
      );
      await env.pg.query(`UPDATE notifications SET deleted_at = now() WHERE id = $1`, [
        deletedId,
      ]);

      const res = await request(env.httpServer)
        .get('/api/notifications/unread-count')
        .set(auth(user))
        .expect(200);

      expect(res.body.unread_count).toBe(1);
    });
  });

  // ===================================================================
  // R7.2 — organizations: DELETE is a soft delete, excluded from reads
  // ===================================================================

  describe('R7.2 — organizations', () => {
    it('DELETE /organizations/:id soft-deletes (row persists with deleted_at set), excluded from GET list, idempotent', async () => {
      const admin = await env.provisionUser([
        'CREATE organizations',
        'READ organizations',
        'DELETE organizations',
      ]);

      const created = await request(env.httpServer)
        .post('/api/organizations')
        .set(auth(admin))
        .send({ name: `SoftDel Org ${randomUUID()}` })
        .expect(201);
      const orgId = created.body.id as string;

      await request(env.httpServer)
        .delete(`/api/organizations/${orgId}`)
        .set(auth(admin))
        .expect(204);

      // Persists in the DB, soft (not hard) deleted.
      const { rows } = await env.pg.query(
        `SELECT deleted_at FROM organizations WHERE id = $1`,
        [orgId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].deleted_at).not.toBeNull();

      // Excluded from the list.
      const listRes = await request(env.httpServer)
        .get('/api/organizations')
        .set(auth(admin))
        .expect(200);
      expect((listRes.body.items as Array<{ id: string }>).some((o) => o.id === orgId)).toBe(
        false,
      );

      // Idempotent — deleting again still returns 204, not 404.
      await request(env.httpServer)
        .delete(`/api/organizations/${orgId}`)
        .set(auth(admin))
        .expect(204);
    });

    it('a soft-deleted org is excluded from GET /organizations/notified-for', async () => {
      const admin = await env.provisionUser([
        'CREATE organizations',
        'READ organizations',
        'DELETE organizations',
      ]);
      const { rows: zoneRows } = await env.pg.query<{ id: string }>(
        `SELECT id FROM geo_zones ORDER BY created_at LIMIT 1`,
      );
      const zoneId = zoneRows[0]?.id;
      expect(zoneId).toBeDefined();

      const created = await request(env.httpServer)
        .post('/api/organizations')
        .set(auth(admin))
        .send({ name: `NotifiedFor Org ${randomUUID()}`, zone_id: zoneId })
        .expect(201);
      const orgId = created.body.id as string;

      await request(env.httpServer)
        .delete(`/api/organizations/${orgId}`)
        .set(auth(admin))
        .expect(204);

      const res = await request(env.httpServer)
        .get('/api/organizations/notified-for')
        .query({ location_id: zoneId })
        .set(auth(admin))
        .expect(200);

      expect((res.body as Array<{ id: string }>).some((o) => o.id === orgId)).toBe(false);
    });
  });

  // ===================================================================
  // R7.3 — incident-categories: DELETE is a soft delete, excluded from list
  // ===================================================================

  describe('R7.3 — incident categories', () => {
    it('DELETE /incident-categories/:id soft-deletes and excludes the row from GET list', async () => {
      const admin = await env.provisionUser([
        'CREATE incident-categories',
        'READ incident-categories',
        'DELETE incident-categories',
      ]);

      const created = await request(env.httpServer)
        .post('/api/incident-categories')
        .set(auth(admin))
        .send({ name: `SoftDel Category ${randomUUID()}` })
        .expect(201);
      const categoryId = created.body.id as string;

      await request(env.httpServer)
        .delete(`/api/incident-categories/${categoryId}`)
        .set(auth(admin))
        .expect(204);

      const { rows } = await env.pg.query(
        `SELECT deleted_at FROM incident_categories WHERE id = $1`,
        [categoryId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].deleted_at).not.toBeNull();

      const listRes = await request(env.httpServer)
        .get('/api/incident-categories')
        .set(auth(admin))
        .expect(200);
      expect(
        (listRes.body.items as Array<{ id: string }>).some((c) => c.id === categoryId),
      ).toBe(false);

      // Idempotent.
      await request(env.httpServer)
        .delete(`/api/incident-categories/${categoryId}`)
        .set(auth(admin))
        .expect(204);
    });
  });

  // ===================================================================
  // R7.4 — geo-zones: `deleted_at` (0031) exists for schema parity, but
  // is intentionally NOT wired into the delete path. `active` is this
  // table's own pre-existing, REVERSIBLE soft-delete toggle (design D8:
  // PATCH `{active: true}` re-activates a zone) — a genuinely different
  // shape from the other 12 one-way soft-deletable tables. Geofencing
  // exclusion via `active=false` is already covered end to end by
  // `geo-zones.e2e-spec.ts`'s TS-10; this just documents that
  // `deleted_at` stays NULL (not double-booked) across that same flow.
  // ===================================================================

  describe('R7.4 — geo-zones (deleted_at intentionally unwired)', () => {
    function squareAround(lat: number, lng: number, half: number) {
      return {
        type: 'Polygon',
        coordinates: [
          [
            [lng - half, lat - half],
            [lng + half, lat - half],
            [lng + half, lat + half],
            [lng - half, lat + half],
            [lng - half, lat - half],
          ],
        ],
      };
    }

    const THROWAWAY_LAT = 5.5;
    const THROWAWAY_LNG = -75.0;

    it('DELETE /geo-zones/:id sets active=false, leaves deleted_at NULL, and the zone stays excluded from geofencing', async () => {
      const admin = await env.provisionUser([
        'CREATE geo-zones',
        'DELETE geo-zones',
        'CREATE incidents',
      ]);

      const zone = await request(env.httpServer)
        .post('/api/geo-zones')
        .set(auth(admin))
        .send({
          name: `R7.4 Zone ${randomUUID()}`,
          level: 'zona',
          polygon: squareAround(THROWAWAY_LAT, THROWAWAY_LNG, 0.5),
        })
        .expect(201);
      const zoneId = zone.body.id as string;

      await request(env.httpServer)
        .delete(`/api/geo-zones/${zoneId}`)
        .set(auth(admin))
        .expect(204);

      const { rows } = await env.pg.query(`SELECT deleted_at, active FROM geo_zones WHERE id = $1`, [
        zoneId,
      ]);
      expect(rows[0].active).toBe(false);
      expect(rows[0].deleted_at).toBeNull();

      const incident = await request(env.httpServer)
        .post('/api/incidents')
        .set(auth(admin))
        .send({
          title: 'R7.4 incident',
          description: 'inside the deactivated zone',
          lat: THROWAWAY_LAT,
          lng: THROWAWAY_LNG,
        })
        .expect(201);

      expect(incident.body.zone_id).toBeNull();
      expect(incident.body.geofence_matched).toBe(false);

      await env.pg.query('DELETE FROM geo_zones WHERE id = $1', [zoneId]);
    });
  });

  // ===================================================================
  // R7.5 — a soft-deleted role locks out every assigned user (403)
  // ===================================================================

  describe('R7.5 — role soft-delete locks out assigned users', () => {
    it('a user whose role was soft-deleted gets 403 on a protected endpoint', async () => {
      const roleId = randomUUID();
      await env.pg.query(
        `INSERT INTO roles (id, name, permissions) VALUES ($1, $2, $3::jsonb)`,
        [roleId, `r7.5-role-${roleId}`, JSON.stringify(['READ organizations'])],
      );

      const target = await env.provisionUser(['READ organizations']);
      // Attach the throwaway role directly (provisionUser only looks up
      // roleName against SEEDED roles — this one was just created above).
      await env.pg.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [roleId, target.userId]);

      // Sanity: works BEFORE the role is soft-deleted.
      await request(env.httpServer)
        .get('/api/organizations')
        .set(auth(target))
        .expect(200);

      const admin = await env.provisionUser(['DELETE roles']);
      await request(env.httpServer)
        .delete(`/api/roles/${roleId}`)
        .set(auth(admin))
        .expect(204);

      // The role row persists (soft delete), it just no longer authorizes.
      const { rows } = await env.pg.query(`SELECT deleted_at FROM roles WHERE id = $1`, [roleId]);
      expect(rows[0].deleted_at).not.toBeNull();

      await request(env.httpServer)
        .get('/api/organizations')
        .set(auth(target))
        .expect(403);
    });

    it('is idempotent — soft-deleting an already-deleted role still returns 204', async () => {
      const roleId = randomUUID();
      await env.pg.query(
        `INSERT INTO roles (id, name, permissions) VALUES ($1, $2, $3::jsonb)`,
        [roleId, `r7.5-idem-${roleId}`, JSON.stringify([])],
      );
      const admin = await env.provisionUser(['DELETE roles']);

      await request(env.httpServer).delete(`/api/roles/${roleId}`).set(auth(admin)).expect(204);
      await request(env.httpServer).delete(`/api/roles/${roleId}`).set(auth(admin)).expect(204);
    });
  });

  // ===================================================================
  // R7.6 — a soft-deleted permission catalog row, once recalculated,
  // revokes that exact "ACTION resource" string from any role that had it
  // ===================================================================

  describe('R7.6 — permission soft-delete revokes it on recalculation', () => {
    it('recalculating a role after its permission was soft-deleted strips it and locks out the action for holders', async () => {
      const resource = `r7-6-resource-${randomUUID()}`;
      const permissionId = randomUUID();
      await env.pg.query(
        `INSERT INTO permissions (id, resource, action) VALUES ($1, $2, 'CREATE')`,
        [permissionId, resource],
      );

      const roleId = randomUUID();
      await env.pg.query(
        `INSERT INTO roles (id, name, permissions) VALUES ($1, $2, $3::jsonb)`,
        [
          roleId,
          `r7.6-role-${roleId}`,
          JSON.stringify(['READ organizations', `CREATE ${resource}`]),
        ],
      );

      const holder = await env.provisionUser(['READ organizations', `CREATE ${resource}`]);
      await env.pg.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [roleId, holder.userId]);

      // Soft-delete the catalog permission row directly (no admin API exists
      // for this — catalog rows are seeded/managed at the DB level).
      await env.pg.query(`UPDATE permissions SET deleted_at = now() WHERE id = $1`, [
        permissionId,
      ]);

      const admin = await env.provisionUser(['UPDATE roles']);
      const recalcRes = await request(env.httpServer)
        .post(`/api/roles/${roleId}/recalculate-permissions`)
        .set(auth(admin))
        .expect(201);

      expect(recalcRes.body.permissions).toEqual(['READ organizations']);
      expect(recalcRes.body.permissions).not.toContain(`CREATE ${resource}`);

      // Propagated onto the already-assigned user's own denormalized array.
      const { rows } = await env.pg.query<{ permissions: string[] }>(
        `SELECT permissions FROM users WHERE id = $1`,
        [holder.userId],
      );
      expect(rows[0].permissions).not.toContain(`CREATE ${resource}`);
    });

    it('is a no-op when the role holds no soft-deleted permission', async () => {
      const roleId = randomUUID();
      await env.pg.query(
        `INSERT INTO roles (id, name, permissions) VALUES ($1, $2, $3::jsonb)`,
        [roleId, `r7.6-noop-${roleId}`, JSON.stringify(['READ organizations'])],
      );
      const admin = await env.provisionUser(['UPDATE roles']);

      const res = await request(env.httpServer)
        .post(`/api/roles/${roleId}/recalculate-permissions`)
        .set(auth(admin))
        .expect(201);

      expect(res.body.permissions).toEqual(['READ organizations']);
    });
  });
});
