import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * T7.9.C2 — unit tests for `database/seeds/generate-geo-zones-seed.js`
 * (design.md D1/D2/D3).
 *
 * The generator is plain CommonJS (dependency-free by design, D3/D7),
 * outside `rootDir`/TypeScript's module graph — `require`d directly rather
 * than imported.
 *
 * (a) checksum guard: `generate(legacyInput)` must stay byte-identical to
 *     the already-committed `0003_seed_geo_zones.generated.sql` — that file
 *     is what got pasted into migration 0003, so any drift here would mean
 *     0003's registered checksum silently no longer matches its generator.
 * (b) `uuidV5(code, NS_GEO_ZONE)` must carry version nibble '5' — a
 *     structural (not probabilistic) non-collision proof against the
 *     hand-picked v4-shaped literals in ZONE_IDS, whose third group always
 *     starts with '4'.
 * (c) every parroquia code follows `EC-24-<canton>-<parish>`.
 * (d) a bare `Polygon` input geometry gets wrapped in `ST_Multi(...)` in the
 *     emitted SQL — `geo_zones.polygon` is `geometry(MultiPolygon, 4326)`.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const generator = require('../../../database/seeds/generate-geo-zones-seed.js') as {
  generate: (data: Record<string, unknown>) => string;
  generateParroquias: (featureCollection: {
    type: string;
    features: Array<{
      type: string;
      properties: { code: string; dpa: string; name: string; osm_relation?: number };
      geometry: { type: string; coordinates: unknown };
    }>;
  }) => string;
  uuidV5: (name: string, namespace: string) => string;
  NS_GEO_ZONE: string;
  ZONE_IDS: Record<string, string>;
};

const REPO_ROOT = join(__dirname, '../../..');
const LEGACY_INPUT_PATH = join(
  REPO_ROOT,
  'GeoReporta/backend/database/data/ecuador-locations-geom.json',
);
const LEGACY_OUTPUT_PATH = join(REPO_ROOT, 'database/seeds/0003_seed_geo_zones.generated.sql');
const PARROQUIAS_INPUT_PATH = join(REPO_ROOT, 'database/data/santa-elena-parroquias.geojson');

describe('generate-geo-zones-seed.js (T7.9.C2)', () => {
  it('(a) generate(legacyInput) is byte-identical to the committed 0003 seed', () => {
    const legacyInput = JSON.parse(readFileSync(LEGACY_INPUT_PATH, 'utf8')) as Record<
      string,
      unknown
    >;
    const expected = readFileSync(LEGACY_OUTPUT_PATH, 'utf8');

    expect(generator.generate(legacyInput)).toBe(expected);
  });

  it('(b) uuidV5(code, NS_GEO_ZONE) is deterministic with version nibble 5 — structurally distinct from the v4 ZONE_IDS literals', () => {
    const id = generator.uuidV5('EC-24-01-50', generator.NS_GEO_ZONE);

    // Full RFC-4122 v5 shape: version nibble '5', variant nibble in {8,9,a,b}.
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    // Deterministic — same input, same output, every call.
    expect(generator.uuidV5('EC-24-01-50', generator.NS_GEO_ZONE)).toBe(id);

    // Structural non-collision: every existing ZONE_IDS literal is a v4
    // UUID (third group starts with '4'), never '5'.
    for (const literal of Object.values(generator.ZONE_IDS)) {
      expect(literal.split('-')[2][0]).toBe('4');
    }
    expect(id.split('-')[2][0]).toBe('5');
  });

  it('(c) every parroquia code follows the EC-24-<canton>-<parish> pattern', () => {
    const featureCollection = JSON.parse(readFileSync(PARROQUIAS_INPUT_PATH, 'utf8')) as {
      features: Array<{ properties: { code: string } }>;
    };

    expect(featureCollection.features.length).toBeGreaterThan(0);

    const sql = generator.generateParroquias(
      featureCollection as Parameters<typeof generator.generateParroquias>[0],
    );

    for (const feature of featureCollection.features) {
      expect(feature.properties.code).toMatch(/^EC-24-\d{2}-\d{2}$/);
      expect(sql).toContain(`'${feature.properties.code}'`);
    }
  });

  it('(d) wraps a bare GeoJSON Polygon input geometry in ST_Multi(...) in the emitted SQL', () => {
    const syntheticFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { code: 'EC-24-01-99', dpa: '240199', name: 'Sintética' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-80.8, -2.2],
                [-80.7, -2.2],
                [-80.7, -2.1],
                [-80.8, -2.1],
                [-80.8, -2.2],
              ],
            ],
          },
        },
      ],
    };

    const sql = generator.generateParroquias(syntheticFeatureCollection);

    expect(sql).toContain('ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($geojson${"type":"Polygon"');
  });

  it('(c/e) rejects a parroquia whose implied canton code is not in ZONE_IDS', () => {
    const bogusFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { code: 'EC-24-99-01', dpa: '249901', name: 'Inexistente' },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        },
      ],
    };

    expect(() => generator.generateParroquias(bogusFeatureCollection)).toThrow(/EC-24-99/);
  });
});
