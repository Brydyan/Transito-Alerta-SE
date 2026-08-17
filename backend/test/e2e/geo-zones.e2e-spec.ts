import { randomUUID } from 'crypto';
import request from 'supertest';

import { ProvisionedUser, TestEnvironment } from '../support/test-environment';

/**
 * GeoZones e2e (T3.8). Real HTTP, real Postgres+PostGIS, real Redis — proves
 * the geometry pre-flight, hierarchy/cycle guards, soft-delete lifecycle,
 * and the point-cache purge (CC5) actually hold end to end.
 *
 * IMPORTANT: `test-environment.ts` `reset()` deliberately PRESERVES
 * `geo_zones` seed rows (Santa Elena province + 3 cantons). Every scenario
 * that mutates a boundary or deactivates/creates a zone therefore creates
 * its own THROWAWAY zone OUTSIDE the seeded bbox
 * (lng[-81.008,-80.200] x lat[-2.508,-1.669]) and hard-deletes it in
 * afterEach — `findZoneByPoint` is `LIMIT 1` with no `ORDER BY`, so an
 * overlapping leftover zone would make other suites' resolutions
 * nondeterministic depending on run order.
 */
describe('GeoZones e2e (T3.8)', () => {
  let env: TestEnvironment;
  let admin: ProvisionedUser;
  let reader: ProvisionedUser;
  const createdZoneIds: string[] = [];

  const SEEDED_PROVINCE_ID = '8f14e45f-ceea-4c1f-8f2c-000000000024';

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
    admin = await env.provisionUser([
      'CREATE geo-zones',
      'READ geo-zones',
      'UPDATE geo-zones',
      'DELETE geo-zones',
      'CREATE incidents',
    ]);
    reader = await env.provisionUser(['READ geo-zones']);
    createdZoneIds.length = 0;
  });

  afterEach(async () => {
    // Hard delete — legitimate here as test teardown, not the API's
    // semantics (design/spec: the API itself never hard-deletes).
    for (const id of createdZoneIds) {
      await env.pg.query('DELETE FROM geo_zones WHERE id = $1', [id]);
    }
  });

  function authHeader(user: ProvisionedUser) {
    return { Authorization: `Bearer ${user.accessToken}` };
  }

  /** A large square OUTSIDE the seeded Santa Elena bbox, centered near (0.5, -78.0). */
  function squareAround(lat: number, lng: number, half: number): {
    type: 'Polygon';
    coordinates: number[][][];
  } {
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

  const THROWAWAY_LAT = 0.5;
  const THROWAWAY_LNG = -78.0;
  const BOWTIE_POLYGON = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [2, 2],
        [2, 0],
        [0, 2],
        [0, 0],
      ],
    ],
  };

  function createZone(
    body: Record<string, unknown>,
    asUser: ProvisionedUser = admin,
  ): request.Test {
    return request(env.httpServer).post('/api/geo-zones').set(authHeader(asUser)).send(body);
  }

  async function createThrowawayZone(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string }> {
    const res = await createZone({
      name: 'Throwaway Zone',
      level: 'zona',
      polygon: squareAround(THROWAWAY_LAT, THROWAWAY_LNG, 0.5),
      ...overrides,
    }).expect(201);
    createdZoneIds.push(res.body.id as string);
    return res.body as { id: string };
  }

  // TS-1: Create Root Zone
  it('creates a root provincia zone (TS-1)', async () => {
    const created = await createZone({
      name: 'Guayas',
      level: 'provincia',
      polygon: squareAround(1.5, -79.0, 0.3),
    }).expect(201);
    createdZoneIds.push(created.body.id as string);

    expect(created.body).toMatchObject({ level: 'provincia', parent_id: null, name: 'Guayas' });
    expect(created.body.id).toEqual(expect.any(String));
  });

  // TS-2: Create Child Zone
  it('creates a child canton zone with parent_id (TS-2)', async () => {
    const root = await createZone({
      name: 'Guayas',
      level: 'provincia',
      polygon: squareAround(1.5, -79.0, 0.3),
    }).expect(201);
    createdZoneIds.push(root.body.id as string);

    const child = await createZone({
      name: 'Daule',
      level: 'canton',
      parent_id: root.body.id as string,
      polygon: squareAround(1.5, -79.0, 0.1),
    }).expect(201);
    createdZoneIds.push(child.body.id as string);

    expect(child.body.parent_id).toBe(root.body.id);
  });

  // TS-3: Bare Polygon Coerced to MultiPolygon
  it('coerces a bare GeoJSON Polygon to MultiPolygon on read (TS-3)', async () => {
    const created = await createThrowawayZone();

    const fetched = await request(env.httpServer)
      .get(`/api/geo-zones/${created.id}`)
      .set(authHeader(reader))
      .expect(200);

    expect(fetched.body.polygon.type).toBe('MultiPolygon');
  });

  // TS-4: Invalid Geometry Rejected
  it('rejects a self-intersecting bowtie polygon with 400 INVALID_GEOMETRY (TS-4)', async () => {
    const response = await createZone({
      name: 'Bowtie',
      level: 'zona',
      polygon: BOWTIE_POLYGON,
    }).expect(400);

    expect(response.body.message).toMatch(/self-intersection/i);
  });

  // TS-5: Invalid Level Rejected
  it('rejects an invalid level with 400 (TS-5)', async () => {
    await createZone({
      name: 'Bad Level',
      level: 'ciudad',
      polygon: squareAround(THROWAWAY_LAT, THROWAWAY_LNG, 0.5),
    }).expect(400);
  });

  // TS-6: Parent Not Found
  it('rejects a parent_id referencing a non-existent zone with 400 PARENT_NOT_FOUND (TS-6)', async () => {
    // A well-formed v4 UUID that simply does not exist — `@IsUUID('4')`
    // rejects the all-zeros nil UUID as malformed (version nibble is not
    // '4'), which would 400 at the DTO layer instead of exercising the
    // service's PARENT_NOT_FOUND path this test targets.
    const missingParentId = randomUUID();

    const response = await createZone({
      name: 'Orphan',
      level: 'canton',
      parent_id: missingParentId,
      polygon: squareAround(THROWAWAY_LAT, THROWAWAY_LNG, 0.5),
    }).expect(400);

    expect(response.body.message).toMatch(/parent/i);
  });

  // TS-7: Cycle Rejected on Re-parent
  //
  // Chain built from `zona`-level zones (unconstrained parent level, design
  // "assertValidParent" table) rather than provincia/canton/parroquia: a
  // provincia can NEVER have a parent (any parent_id on a provincia is a
  // 400 INVALID_PARENT_LEVEL, checked before the cycle guard per the
  // documented order "parent exists -> level compatible -> no cycle"), so
  // re-parenting a provincia root would always trip the level check first
  // and never reach the cycle guard this scenario is meant to exercise.
  it('rejects a cycle on re-parent with 400 CYCLIC_PARENT; no row mutated (TS-7)', async () => {
    const a = await createZone({
      name: 'A',
      level: 'zona',
      polygon: squareAround(1.0, -79.0, 0.05),
    }).expect(201);
    createdZoneIds.push(a.body.id as string);
    const b = await createZone({
      name: 'B',
      level: 'zona',
      parent_id: a.body.id as string,
      polygon: squareAround(1.0, -79.0, 0.03),
    }).expect(201);
    createdZoneIds.push(b.body.id as string);
    const c = await createZone({
      name: 'C',
      level: 'zona',
      parent_id: b.body.id as string,
      polygon: squareAround(1.0, -79.0, 0.01),
    }).expect(201);
    createdZoneIds.push(c.body.id as string);

    const response = await request(env.httpServer)
      .patch(`/api/geo-zones/${a.body.id as string}`)
      .set(authHeader(admin))
      .send({ parent_id: c.body.id as string })
      .expect(400);

    expect(response.body.message).toMatch(/circular/i);

    const unchanged = await request(env.httpServer)
      .get(`/api/geo-zones/${a.body.id as string}`)
      .set(authHeader(reader))
      .expect(200);
    expect(unchanged.body.parent_id).toBeNull();
  });

  // TS-8: Tree Depth >= 2 on seeded data
  it('GET /tree shows the seeded Santa Elena province with exactly 3 canton children (TS-8)', async () => {
    const tree = await request(env.httpServer)
      .get('/api/geo-zones/tree')
      .set(authHeader(reader))
      .expect(200);

    const province = tree.body.find((n: { id: string }) => n.id === SEEDED_PROVINCE_ID);
    expect(province).toBeDefined();
    expect(province.level).toBe('provincia');
    expect(province.children).toHaveLength(3);
    expect(
      province.children.every((c: { level: string }) => c.level === 'canton'),
    ).toBe(true);
  });

  // TS-9: Deactivate Preserves Children
  it('deactivating a parent does not cascade — children stay active (TS-9)', async () => {
    const parent = await createZone({
      name: 'Parent',
      level: 'provincia',
      polygon: squareAround(1.2, -79.2, 0.1),
    }).expect(201);
    createdZoneIds.push(parent.body.id as string);
    const child = await createZone({
      name: 'Child',
      level: 'canton',
      parent_id: parent.body.id as string,
      polygon: squareAround(1.2, -79.2, 0.05),
    }).expect(201);
    createdZoneIds.push(child.body.id as string);

    await request(env.httpServer)
      .delete(`/api/geo-zones/${parent.body.id as string}`)
      .set(authHeader(admin))
      .expect(204);

    const parentRow = await request(env.httpServer)
      .get(`/api/geo-zones/${parent.body.id as string}`)
      .set(authHeader(reader))
      .expect(200);
    expect(parentRow.body.active).toBe(false);

    const childRow = await request(env.httpServer)
      .get(`/api/geo-zones/${child.body.id as string}`)
      .set(authHeader(reader))
      .expect(200);
    expect(childRow.body.active).toBe(true);
  });

  // TS-10: Inactive Zone Excluded from Geofencing
  it('excludes an inactive zone from geofencing containment (TS-10)', async () => {
    const zone = await createThrowawayZone({ name: 'To Deactivate' });

    await request(env.httpServer)
      .delete(`/api/geo-zones/${zone.id}`)
      .set(authHeader(admin))
      .expect(204);

    const incident = await request(env.httpServer)
      .post('/api/incidents')
      .set(authHeader(admin))
      .send({
        title: 'Choque',
        description: 'Sin heridos',
        lat: THROWAWAY_LAT,
        lng: THROWAWAY_LNG,
      })
      .expect(201);

    expect(incident.body.zone_id).toBeNull();
    expect(incident.body.geofence_matched).toBe(false);
  });

  // TS-11 (CC5): Boundary Shrink Affects Only New Incidents — deterministic, no sleep.
  it('a boundary shrink purges the point cache; only a NEWLY submitted incident resolves outside (TS-11 / CC5)', async () => {
    const zone = await createThrowawayZone({ name: 'Shrinking Zone' });

    // act 1: incident inside the large zone -> warms the point cache.
    const firstIncident = await request(env.httpServer)
      .post('/api/incidents')
      .set(authHeader(admin))
      .send({
        title: 'Incident 1',
        description: 'inside the zone',
        lat: THROWAWAY_LAT,
        lng: THROWAWAY_LNG,
      })
      .expect(201);
    expect(firstIncident.body.zone_id).toBe(zone.id);
    expect(firstIncident.body.geofence_matched).toBe(true);

    const pointCacheKey = `geo:point:${THROWAWAY_LAT.toFixed(3)}:${THROWAWAY_LNG.toFixed(3)}`;
    expect(await env.redisCache.exists(pointCacheKey)).toBe(1);
    expect(await env.redisStreams.sismember('geo:tags:points', pointCacheKey)).toBe(1);

    // act 2: shrink the polygon to a tiny square that excludes P, far from THROWAWAY_LAT/LNG.
    await request(env.httpServer)
      .patch(`/api/geo-zones/${zone.id}`)
      .set(authHeader(admin))
      .send({ polygon: squareAround(THROWAWAY_LAT + 5, THROWAWAY_LNG + 5, 0.01) })
      .expect(200);

    // The purge actually happened, on DB 1 — deterministic, no sleep.
    expect(await env.redisCache.exists(pointCacheKey)).toBe(0);
    expect(await env.redisStreams.exists('geo:tags:points')).toBe(0);

    // act 3: a newly submitted incident at the SAME point no longer resolves to the zone.
    const secondIncident = await request(env.httpServer)
      .post('/api/incidents')
      .set(authHeader(admin))
      .send({
        title: 'Incident 2',
        description: 'submitted after the boundary shrink',
        lat: THROWAWAY_LAT,
        lng: THROWAWAY_LNG,
      })
      .expect(201);
    expect(secondIncident.body.zone_id).toBeNull();
    expect(secondIncident.body.geofence_matched).toBe(false);

    // Non-retroactivity: the FIRST incident keeps its original zone_id.
    const { rows } = await env.pg.query<{ zone_id: string | null }>(
      'SELECT zone_id FROM incidents WHERE id = $1',
      [firstIncident.body.id],
    );
    expect(rows[0].zone_id).toBe(zone.id);
  });

  // TS-12: Permission Guards
  it('rejects mutating requests from a caller without the matching permission with 403 (TS-12)', async () => {
    await createZone(
      {
        name: 'Blocked',
        level: 'zona',
        polygon: squareAround(THROWAWAY_LAT, THROWAWAY_LNG, 0.5),
      },
      reader,
    ).expect(403);

    const zone = await createThrowawayZone({ name: 'Existing' });

    await request(env.httpServer)
      .patch(`/api/geo-zones/${zone.id}`)
      .set(authHeader(reader))
      .send({ name: 'Renamed' })
      .expect(403);

    await request(env.httpServer)
      .delete(`/api/geo-zones/${zone.id}`)
      .set(authHeader(reader))
      .expect(403);
  });

  // TS-13: Seed Backfill Verification (read-only — safe on seeded data).
  it('verifies migration 0013 seed backfill: province level/parent_id + 3 cantons (TS-13)', async () => {
    const { rows: provinceRows } = await env.pg.query<{
      level: string;
      parent_id: string | null;
    }>('SELECT level, parent_id FROM geo_zones WHERE id = $1', [SEEDED_PROVINCE_ID]);

    expect(provinceRows).toHaveLength(1);
    expect(provinceRows[0].level).toBe('provincia');
    expect(provinceRows[0].parent_id).toBeNull();

    const { rows: cantonRows } = await env.pg.query<{ level: string; parent_id: string }>(
      'SELECT level, parent_id FROM geo_zones WHERE parent_id = $1',
      [SEEDED_PROVINCE_ID],
    );

    expect(cantonRows).toHaveLength(3);
    for (const row of cantonRows) {
      expect(row.level).toBe('canton');
      expect(row.parent_id).toBe(SEEDED_PROVINCE_ID);
    }
  });

  // Additional cases from the design's "other e2e cases" table.
  it('rejects a GeoJSON Point submitted as polygon with 400 (DTO, E3)', async () => {
    await createZone({
      name: 'Point Zone',
      level: 'zona',
      polygon: { type: 'Point', coordinates: [THROWAWAY_LNG, THROWAWAY_LAT] },
    }).expect(400);
  });

  it("rejects re-parenting a canton's parent to another canton with 400 Invalid parent level", async () => {
    const province = await createZone({
      name: 'Province',
      level: 'provincia',
      polygon: squareAround(2.0, -79.5, 0.1),
    }).expect(201);
    createdZoneIds.push(province.body.id as string);
    const cantonA = await createZone({
      name: 'Canton A',
      level: 'canton',
      parent_id: province.body.id as string,
      polygon: squareAround(2.0, -79.5, 0.03),
    }).expect(201);
    createdZoneIds.push(cantonA.body.id as string);
    const cantonB = await createZone({
      name: 'Canton B',
      level: 'canton',
      parent_id: province.body.id as string,
      polygon: squareAround(2.1, -79.5, 0.03),
    }).expect(201);
    createdZoneIds.push(cantonB.body.id as string);

    const response = await request(env.httpServer)
      .patch(`/api/geo-zones/${cantonA.body.id as string}`)
      .set(authHeader(admin))
      .send({ parent_id: cantonB.body.id as string })
      .expect(400);

    expect(response.body.message).toMatch(/parent level/i);
  });

  it('DELETE /:id is idempotent — 204 both times', async () => {
    const zone = await createThrowawayZone();

    await request(env.httpServer)
      .delete(`/api/geo-zones/${zone.id}`)
      .set(authHeader(admin))
      .expect(204);

    await request(env.httpServer)
      .delete(`/api/geo-zones/${zone.id}`)
      .set(authHeader(admin))
      .expect(204);
  });

  it('GET /geo-zones default excludes inactive zones; ?include_inactive=true includes them', async () => {
    const zone = await createThrowawayZone({ name: 'Filterable Zone' });
    await request(env.httpServer)
      .delete(`/api/geo-zones/${zone.id}`)
      .set(authHeader(admin))
      .expect(204);

    const defaultList = await request(env.httpServer)
      .get('/api/geo-zones')
      .query({ search: 'Filterable Zone' })
      .set(authHeader(reader))
      .expect(200);
    expect(defaultList.body.items.map((i: { id: string }) => i.id)).not.toContain(zone.id);

    const inclusiveList = await request(env.httpServer)
      .get('/api/geo-zones')
      .query({ search: 'Filterable Zone', include_inactive: 'true' })
      .set(authHeader(reader))
      .expect(200);
    expect(inclusiveList.body.items.map((i: { id: string }) => i.id)).toContain(zone.id);
  });

  it('PATCH { active: true } re-activates a deactivated zone and a subsequent incident resolves to it again', async () => {
    const zone = await createThrowawayZone();
    await request(env.httpServer)
      .delete(`/api/geo-zones/${zone.id}`)
      .set(authHeader(admin))
      .expect(204);

    await request(env.httpServer)
      .patch(`/api/geo-zones/${zone.id}`)
      .set(authHeader(admin))
      .send({ active: true })
      .expect(200);

    const incident = await request(env.httpServer)
      .post('/api/incidents')
      .set(authHeader(admin))
      .send({
        title: 'Reactivated zone incident',
        description: 'inside reactivated zone',
        lat: THROWAWAY_LAT,
        lng: THROWAWAY_LNG,
      })
      .expect(201);
    expect(incident.body.zone_id).toBe(zone.id);
  });

  it('returns 404 for GET/PATCH/DELETE on a non-existent zone', async () => {
    const missingId = '00000000-0000-0000-0000-000000000000';

    await request(env.httpServer)
      .get(`/api/geo-zones/${missingId}`)
      .set(authHeader(reader))
      .expect(404);

    await request(env.httpServer)
      .patch(`/api/geo-zones/${missingId}`)
      .set(authHeader(admin))
      .send({ name: 'X' })
      .expect(404);

    await request(env.httpServer)
      .delete(`/api/geo-zones/${missingId}`)
      .set(authHeader(admin))
      .expect(404);
  });

  it('rejects requests without a token with 401', async () => {
    await request(env.httpServer).get('/api/geo-zones').expect(401);
  });
});
