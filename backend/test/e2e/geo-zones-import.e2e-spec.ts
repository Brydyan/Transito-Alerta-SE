/**
 * geo-zones-import.e2e-spec.ts — Integration tests for POST /geo-zones/import
 * and GET /geo-zones/form-data (sc-334 Phase 1).
 *
 * Real HTTP, real Postgres+PostGIS, real shapefile parsing with shpjs.
 * Tests spec scenarios R7 (a-f) and R9.
 */

import request from 'supertest';

import { ProvisionedUser, TestEnvironment } from '../support/test-environment';
import {
  buildShapefileZip,
  ecuadorSquare,
  THREE_CANTON_FEATURES,
  FixtureFeature,
} from '../support/shapefile-fixture';

describe('GeoZones import e2e (sc-334)', () => {
  let env: TestEnvironment;
  let admin: ProvisionedUser;
  let reader: ProvisionedUser;

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
    ]);
    reader = await env.provisionUser(['READ geo-zones']);

    // Clean up any zones created during import tests
    await env.pg.query(
      "DELETE FROM geo_zones WHERE code LIKE 'TST-%'",
    );
  }, 30_000);

  function authHeader(user: ProvisionedUser) {
    return { Authorization: `Bearer ${user.accessToken}` };
  }

  // ── Scenario (a): Valid 3-feature import ─────────────────────────────────

  it('(a) valid 3-canton zip → 200 + { imported:3, skipped:0, errors:[], warnings:[] }', async () => {
    const zip = await buildShapefileZip(THREE_CANTON_FEATURES);

    const res = await request(env.httpServer)
      .post('/api/geo-zones/import')
      .set(authHeader(admin))
      .query({ level: 'canton', auto_parent: 'false', name_column: 'NAME', code_column: 'CODE' })
      .attach('file', zip, { filename: 'cantons.zip', contentType: 'application/zip' });

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(3);
    expect(res.body.skipped).toBe(0);
    expect(res.body.errors).toHaveLength(0);
    expect(res.body.warnings).toBeInstanceOf(Array);

    // Verify rows are actually in the DB
    const { rows } = await env.pg.query(
      "SELECT id, name, code FROM geo_zones WHERE code LIKE 'TST-%' ORDER BY code",
    );
    expect(rows).toHaveLength(3);
    expect(rows[0].code).toBe('TST-01');
    expect(rows[1].code).toBe('TST-02');
    expect(rows[2].code).toBe('TST-03');
  }, 60_000);

  // ── Scenario (b): Per-feature invalid geometry → partial import ──────────

  it('(b) zip with one invalid-name feature → partial import + errors array', async () => {
    const features: FixtureFeature[] = [
      { name: 'Valid Canton', code: 'TST-OK', coords: ecuadorSquare(-1.5, -79.0) },
      { name: '', code: 'TST-BAD', coords: ecuadorSquare(-1.5, -78.0) }, // empty name → rejected
    ];
    const zip = await buildShapefileZip(features);

    const res = await request(env.httpServer)
      .post('/api/geo-zones/import')
      .set(authHeader(admin))
      .query({ level: 'canton', auto_parent: 'false', name_column: 'NAME', code_column: 'CODE' })
      .attach('file', zip, { filename: 'partial.zip', contentType: 'application/zip' });

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].index).toBe(1);
    expect(res.body.errors[0].reason).toMatch(/name/i);
  }, 60_000);

  // ── Scenario (c): Duplicate code → skipped count ─────────────────────────

  it('(c) duplicate code (already in DB) → skipped count, not error', async () => {
    // First import
    const zip1 = await buildShapefileZip([THREE_CANTON_FEATURES[0]]);
    await request(env.httpServer)
      .post('/api/geo-zones/import')
      .set(authHeader(admin))
      .query({ level: 'canton', auto_parent: 'false', name_column: 'NAME', code_column: 'CODE' })
      .attach('file', zip1, { filename: 'first.zip', contentType: 'application/zip' });

    // Second import with same code
    const zip2 = await buildShapefileZip([THREE_CANTON_FEATURES[0]]);
    const res = await request(env.httpServer)
      .post('/api/geo-zones/import')
      .set(authHeader(admin))
      .query({ level: 'canton', auto_parent: 'false', name_column: 'NAME', code_column: 'CODE' })
      .attach('file', zip2, { filename: 'dupe.zip', contentType: 'application/zip' });

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(0);
    expect(res.body.skipped).toBe(1);
    expect(res.body.errors).toHaveLength(0);
  }, 60_000);

  // ── Scenario (d): File > 10 MB → 413 (handled by Multer limits) ──────────

  it('(d) 11 MB zip → 413 or 400 (file too large — Multer rejects before parse)', async () => {
    // Create a buffer just over 10 MB
    const oversized = Buffer.alloc(11 * 1024 * 1024, 0);

    const res = await request(env.httpServer)
      .post('/api/geo-zones/import')
      .set(authHeader(admin))
      .query({ level: 'canton' })
      .attach('file', oversized, { filename: 'big.zip', contentType: 'application/zip' });

    // Multer may return 413 or NestJS wraps it as 400
    expect([400, 413]).toContain(res.status);
  }, 30_000);

  // ── Scenario (e): Unauthenticated → 401 ─────────────────────────────────

  it('(e) unauthenticated request → 401', async () => {
    const zip = await buildShapefileZip([THREE_CANTON_FEATURES[0]]);

    const res = await request(env.httpServer)
      .post('/api/geo-zones/import')
      .query({ level: 'canton' })
      .attach('file', zip, { filename: 'cantons.zip', contentType: 'application/zip' });

    expect(res.status).toBe(401);
  }, 15_000);

  // ── Scenario (f): No CREATE permission → 403 ─────────────────────────────

  it('(f) authenticated but no CREATE geo-zones permission → 403', async () => {
    const zip = await buildShapefileZip([THREE_CANTON_FEATURES[0]]);

    const res = await request(env.httpServer)
      .post('/api/geo-zones/import')
      .set(authHeader(reader))
      .query({ level: 'canton' })
      .attach('file', zip, { filename: 'cantons.zip', contentType: 'application/zip' });

    expect(res.status).toBe(403);
  }, 15_000);

  // ── GET /geo-zones/form-data ─────────────────────────────────────────────

  describe('GET /geo-zones/form-data', () => {
    it('returns levels array and active zones list for authenticated user', async () => {
      const res = await request(env.httpServer)
        .get('/api/geo-zones/form-data')
        .set(authHeader(reader));

      expect(res.status).toBe(200);
      expect(res.body.levels).toEqual(
        expect.arrayContaining(['cantón', 'parroquia', 'provincia', 'sector']),
      );
      expect(Array.isArray(res.body.parents)).toBe(true);
    }, 30_000);

    it('returns 401 for unauthenticated request', async () => {
      const res = await request(env.httpServer)
        .get('/api/geo-zones/form-data');

      expect(res.status).toBe(401);
    }, 15_000);
  });
});
