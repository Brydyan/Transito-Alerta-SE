import { randomUUID } from 'crypto';

import { IncidentsService } from '../../src/modules/incidents/incidents.service';
import { SubjectScope } from '../../src/shared/authz/subject-scope';
import { ALL_ZONES_TAG } from '../../src/modules/geofencing/geofencing.service';
import { TestEnvironment } from '../support/test-environment';

/**
 * sc-338 — the list-cache staleness bug, proven against REAL Redis.
 *
 * `findAll` caches every listing variant for 30s
 * (`INCIDENTS_LIST_CACHE_TTL_MS = 30_000`) under zone tag-sets. A write
 * that mutates an incident WITHOUT purging those tag-sets leaves the UI
 * serving the old array until the TTL expires — the row is correctly
 * soft-deleted in Postgres the whole time. `create()` purged;
 * `update()` and `softDelete()` did not.
 *
 * The unit spec (incidents.service.spec.ts) can only assert that
 * `geofencing.purgeZoneCache` was CALLED. That is not the same claim. This
 * spec proves the observable behaviour: the listing a reader gets back
 * immediately after the write no longer contains the stale row, with real
 * Redis holding the real cached bytes.
 *
 * Every test warms the cache first and then asserts the reader's view
 * changes on the very next call — never after a 30s wait. A test that
 * sleeps for the TTL would pass even with the bug.
 */
describe('Incidents list-cache invalidation on write (sc-338)', () => {
  let env: TestEnvironment;
  let service: IncidentsService;

  let zoneId: string;
  let otherZoneId: string;
  let citizenId: string;

  const GLOBAL: SubjectScope = { kind: 'global' };

  beforeAll(async () => {
    env = await TestEnvironment.start();
    service = env.app.get(IncidentsService);
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();

    // A fresh zone per test, for two reasons. `reset()` flushes the cache DB
    // but NOT the streams DB where the `geo:tags:*` sets live (it must not,
    // or the consumer groups die), so a stable id would let one test's
    // leftover tag-set point at another test's keys. And the cross-zone
    // listing (`findAll({})`) sees every row in the table, so each test owns
    // its own zones rather than inheriting the previous test's.
    zoneId = randomUUID();
    otherZoneId = randomUUID();
    for (const id of [zoneId, otherZoneId]) {
      await env.pg.query(
        `INSERT INTO geo_zones (id, name, polygon, active)
         VALUES ($1, $2, ST_SetSRID(ST_MakeEnvelope(0, 0, 1, 1, 4326), 4326), true)`,
        [id, `Zone ${id.slice(0, 8)}`],
      );
    }

    citizenId = (await env.provisionUser(['CREATE incidents'])).userId;
  });

  afterEach(async () => {
    // Guarded: when `beforeAll` fails (no container), `env` is undefined and an
    // unguarded teardown buries the real root cause under a second failure.
    if (!env) return;
    await env.pg.query(`DELETE FROM geo_zones WHERE id = ANY($1::uuid[])`, [
      [zoneId, otherZoneId],
    ]);
  });

  async function createIncident(zone: string | null, title = 'Bachehole'): Promise<string> {
    const rows = await env.pg.query<{ id: string }>(
      `INSERT INTO incidents (title, location, citizen_id, zone_id, geofence_matched)
       VALUES ($1, ST_SetSRID(ST_Point(-80.5, -2.2), 4326), $2, $3, $4)
       RETURNING id`,
      [title, citizenId, zone, zone !== null],
    );
    return rows.rows[0].id;
  }

  /** Every list key currently resident in the cache database. */
  function listKeys(): Promise<string[]> {
    return env.redisCache.keys('incidents:list:*');
  }

  function ids(envelope: { items: Array<{ id: string }> }): string[] {
    return envelope.items.map((r) => r.id);
  }

  it('findAll really does cache (so the purge assertions below are not vacuous)', async () => {
    const id = await createIncident(zoneId);
    expect(await listKeys()).toHaveLength(0);

    await service.findAll({ zoneId }, GLOBAL);

    expect(ids(await service.findAll({ zoneId }, GLOBAL))).toEqual([id]);
    expect((await listKeys()).length).toBeGreaterThan(0);
  });

  describe('softDelete', () => {
    it('drops the incident from the cached listing on the very next read', async () => {
      const id = await createIncident(zoneId);
      const keep = await createIncident(zoneId, 'Semaforo caido');

      // Warm the cache: one cached envelope now holds BOTH incidents.
      expect((await service.findAll({ zoneId }, GLOBAL)).items).toHaveLength(2);
      expect((await listKeys()).length).toBeGreaterThan(0);

      await service.softDelete(id);

      // The row is genuinely soft-deleted — this is not a read-side illusion.
      const row = await env.pg.query<{ deleted_at: Date | null }>(
        `SELECT deleted_at FROM incidents WHERE id = $1`,
        [id],
      );
      expect(row.rows[0].deleted_at).not.toBeNull();

      // The next reader must NOT see it, with no TTL wait.
      const after = await service.findAll({ zoneId }, GLOBAL);
      expect(ids(after)).toEqual([keep]);
      expect(after.total).toBe(1);
    });

    it('evicts the cached key and the zone tag-set from Redis', async () => {
      await createIncident(zoneId);
      await service.findAll({ zoneId }, GLOBAL);
      expect((await listKeys()).length).toBeGreaterThan(0);
      expect(await env.redisStreams.exists(`geo:tags:${zoneId}`)).toBe(1);

      await service.softDelete((await service.findAll({ zoneId }, GLOBAL)).items[0].id);

      expect(await listKeys()).toHaveLength(0);
      expect(await env.redisStreams.exists(`geo:tags:${zoneId}`)).toBe(0);
    });

    it('invalidates the UNZONED listing for an incident outside every zone', async () => {
      // zone_id null: `findAll` tagged this key only under ALL_ZONES_TAG,
      // so the concrete-zone purge is a no-op by design.
      const id = await createIncident(null);
      expect(ids(await service.findAll({}, GLOBAL))).toEqual([id]);
      expect((await listKeys()).length).toBeGreaterThan(0);

      await service.softDelete(id);

      // Assert the purge BEFORE re-reading: `findAll` re-populates on the way
      // in, so checking the cache after a read proves nothing about the purge.
      expect(await listKeys()).toHaveLength(0);
      expect(ids(await service.findAll({}, GLOBAL))).toEqual([]);
    });
  });

  describe('update', () => {
    it('serves the edited field on the very next read', async () => {
      const id = await createIncident(zoneId, 'Titulo viejo');
      expect((await service.findAll({ zoneId }, GLOBAL)).items[0].title).toBe('Titulo viejo');

      await service.update(id, { title: 'Titulo nuevo' });

      expect(await listKeys()).toHaveLength(0);
      const after = await service.findAll({ zoneId }, GLOBAL);
      expect(after.items[0].id).toBe(id);
      expect(after.items[0].title).toBe('Titulo nuevo');
    });

    it('invalidates every status/page variant of the zone listing', async () => {
      const id = await createIncident(zoneId);
      // Warm several independently-keyed variants of the same zone listing.
      await service.findAll({ zoneId }, GLOBAL);
      await service.findAll({ zoneId, status: 'pending' as never }, GLOBAL);
      await service.findAll({}, GLOBAL);
      expect((await listKeys()).length).toBeGreaterThan(1);

      await service.update(id, { title: 'Cambio' });

      // A key-by-name delete could never do this: the writer does not know
      // which variants a reader happened to request.
      expect(await listKeys()).toHaveLength(0);
    });
  });

  describe('write ordering', () => {
    it('leaves no stale variant behind when a delete follows a warm read of two zones', async () => {
      const inZone = await createIncident(zoneId);
      const elsewhere = await createIncident(otherZoneId);

      await service.findAll({ zoneId }, GLOBAL);
      await service.findAll({ zoneId: otherZoneId }, GLOBAL);
      await service.findAll({}, GLOBAL);
      expect((await listKeys()).length).toBeGreaterThan(1);

      await service.softDelete(inZone);

      // Both purge assertions precede the re-reads — `findAll` recreates the
      // very keys and tag-sets being asserted here.
      expect(await listKeys()).toHaveLength(0);
      expect(await env.redisStreams.exists(`geo:tags:${ALL_ZONES_TAG}`)).toBe(0);

      expect(ids(await service.findAll({ zoneId }, GLOBAL))).toEqual([]);
      // The other zone survives in the DB...
      expect(ids(await service.findAll({ zoneId: otherZoneId }, GLOBAL))).toEqual([elsewhere]);
      // ...and the cross-zone listing is still correct.
      expect(ids(await service.findAll({}, GLOBAL))).toEqual([elsewhere]);
    });
  });
});
