import { randomUUID } from 'crypto';
import request from 'supertest';
import { TestEnvironment } from '../support/test-environment';

/**
 * T7.6 — missing domain columns (0035): `geo_zones.code`, `users.phone`.
 * R12.1–R12.3 (geo_zones.code), R13.1–R13.3 (users.phone).
 */
describe('E2E T7.6 domain columns (0035)', () => {
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

  async function insertZone(id: string, name: string, code: string | null): Promise<void> {
    await env.pg.query(
      `INSERT INTO geo_zones (id, name, polygon, level, code)
       VALUES ($1, $2, ST_Multi(ST_MakeEnvelope(-81, -3, -80, -2, 4326)), 'zona', $3)`,
      [id, name, code],
    );
  }

  // ---- R12 — geo_zones.code --------------------------------------------

  describe('R12 — geo_zones.code', () => {
    it('R12.1: column exists, nullable, with a partial UNIQUE index WHERE code IS NOT NULL', async () => {
      const { rows: colRows } = await env.pg.query<{ is_nullable: string; data_type: string }>(
        `SELECT is_nullable, data_type FROM information_schema.columns
         WHERE table_name = 'geo_zones' AND column_name = 'code'`,
      );
      expect(colRows).toHaveLength(1);
      expect(colRows[0].is_nullable).toBe('YES');

      const { rows: idxRows } = await env.pg.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
         WHERE tablename = 'geo_zones' AND indexdef ILIKE '%code%' AND indexdef ILIKE '%UNIQUE%'`,
      );
      expect(idxRows).toHaveLength(1);
      expect(idxRows[0].indexdef).toMatch(/WHERE \(?code IS NOT NULL\)?/i);
    });

    it('R12.2: two geo_zones with code = NULL both insert successfully', async () => {
      await expect(insertZone(randomUUID(), 'Zona Sin Codigo A', null)).resolves.toBeUndefined();
      await expect(insertZone(randomUUID(), 'Zona Sin Codigo B', null)).resolves.toBeUndefined();
    });

    it('R12.3: inserting a second geo_zone with a duplicate code is rejected', async () => {
      await insertZone(randomUUID(), 'Zona SE-01 A', 'SE-01');

      await expect(insertZone(randomUUID(), 'Zona SE-01 B', 'SE-01')).rejects.toThrow(
        /duplicate key|unique constraint/i,
      );
    });
  });

  // ---- R13 — users.phone -------------------------------------------------

  describe('R13 — users.phone', () => {
    it('R13.1: column exists on users, varchar(30), nullable', async () => {
      const { rows } = await env.pg.query<{
        is_nullable: string;
        data_type: string;
        character_maximum_length: number;
      }>(
        `SELECT is_nullable, data_type, character_maximum_length FROM information_schema.columns
         WHERE table_name = 'users' AND column_name = 'phone'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].is_nullable).toBe('YES');
      expect(rows[0].character_maximum_length).toBe(30);
    });

    it('R13.2: GET /api/users/me returns the phone field', async () => {
      const user = await env.provisionUser([]);
      await env.pg.query(`UPDATE users SET phone = $1 WHERE id = $2`, [
        '+593999999999',
        user.userId,
      ]);

      const res = await request(env.httpServer)
        .get('/api/users/me')
        .set({ Authorization: `Bearer ${user.accessToken}` })
        .expect(200);

      expect(res.body.phone).toBe('+593999999999');
    });

    it('R13.2b: PATCH /api/users/me updates the phone field', async () => {
      const user = await env.provisionUser([]);

      const res = await request(env.httpServer)
        .patch('/api/users/me')
        .set({ Authorization: `Bearer ${user.accessToken}` })
        .send({ phone: '+593987654321' })
        .expect(200);

      expect(res.body.phone).toBe('+593987654321');

      const { rows } = await env.pg.query<{ phone: string | null }>(
        `SELECT phone FROM users WHERE id = $1`,
        [user.userId],
      );
      expect(rows[0].phone).toBe('+593987654321');
    });

    it('R13.3: the GDPR soft delete wipes phone to NULL', async () => {
      const admin = await env.provisionUser(['DELETE users'], { roleName: 'master' });
      const target = await env.provisionUser([], { email: `target-${randomUUID()}@example.com` });
      await env.pg.query(`UPDATE users SET phone = $1 WHERE id = $2`, [
        '+593911111111',
        target.userId,
      ]);

      await request(env.httpServer)
        .delete(`/api/users/${target.userId}`)
        .set({ Authorization: `Bearer ${admin.accessToken}` })
        .expect(204);

      const { rows } = await env.pg.query<{ phone: string | null }>(
        `SELECT phone FROM users WHERE id = $1`,
        [target.userId],
      );
      expect(rows[0].phone).toBeNull();
    });
  });
});
