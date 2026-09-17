import { BadRequestException, NotFoundException } from '@nestjs/common';

import { GeoZoneDetailRow, GeoZonesRepository } from './geo-zones.repository';
import { GeoZonesService } from './geo-zones.service';

function makeZone(overrides: Partial<GeoZoneDetailRow> = {}): GeoZoneDetailRow {
  return {
    id: 'zone-1',
    name: 'Guayas',
    parent_id: null,
    level: 'provincia',
    active: true,
    polygon: { type: 'MultiPolygon', coordinates: [] },
    code: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

const VALID_GEOMETRY = {
  valid: true,
  reason: null,
  empty: false,
  geom_type: 'ST_MultiPolygon',
  inBounds: true,
};

describe('GeoZonesService', () => {
  let repo: {
    validateGeometry: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    deactivate: jest.Mock;
    findById: jest.Mock;
    findAll: jest.Mock;
    getSubtree: jest.Mock;
    findParentLevel: jest.Mock;
    validateNoCycles: jest.Mock;
  };
  let geofencing: {
    purgeZoneCache: jest.Mock;
    purgePointCache: jest.Mock;
  };
  let service: GeoZonesService;

  beforeEach(() => {
    repo = {
      validateGeometry: jest.fn().mockResolvedValue(VALID_GEOMETRY),
      create: jest.fn(),
      update: jest.fn(),
      deactivate: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      getSubtree: jest.fn(),
      findParentLevel: jest.fn(),
      validateNoCycles: jest.fn().mockResolvedValue(true),
    };
    geofencing = {
      purgeZoneCache: jest.fn().mockResolvedValue(undefined),
      purgePointCache: jest.fn().mockResolvedValue(undefined),
    };
    service = new GeoZonesService(
      repo as unknown as GeoZonesRepository,
      geofencing as unknown as import('../geofencing/geofencing.service').GeofencingService,
    );
  });

  describe('create', () => {
    it('creates a root provincia zone (no parent required) and purges caches', async () => {
      repo.create.mockResolvedValue(makeZone());

      const result = await service.create({
        name: 'Guayas',
        level: 'provincia',
        polygon: { type: 'Polygon', coordinates: [] },
      } as never);

      expect(repo.validateNoCycles).not.toHaveBeenCalled();
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Guayas', level: 'provincia', parentId: null }),
      );
      expect(result.name).toBe('Guayas');
      expect(geofencing.purgeZoneCache).toHaveBeenCalledWith('zone-1');
      expect(geofencing.purgePointCache).toHaveBeenCalled();
    });

    it('validates parent existence, level compatibility and cycle guard when parent_id is provided', async () => {
      repo.findParentLevel.mockResolvedValue('provincia');
      repo.create.mockResolvedValue(makeZone({ level: 'canton', parent_id: 'parent-1' }));

      await service.create({
        name: 'Daule',
        level: 'canton',
        parent_id: 'parent-1',
        polygon: { type: 'Polygon', coordinates: [] },
      } as never);

      expect(repo.findParentLevel).toHaveBeenCalledWith('parent-1');
      expect(repo.validateNoCycles).toHaveBeenCalledWith(null, 'parent-1');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ parentId: 'parent-1' }),
      );
    });

    it('throws 400 PARENT_NOT_FOUND when parent_id does not reference an existing zone', async () => {
      repo.findParentLevel.mockResolvedValue(null);

      await expect(
        service.create({
          name: 'Daule',
          level: 'canton',
          parent_id: 'missing',
          polygon: { type: 'Polygon', coordinates: [] },
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it.each([
      ['provincia', null, true],
      ['provincia', 'provincia', false],
      ['canton', 'provincia', true],
      ['canton', 'canton', false],
      ['canton', 'parroquia', false],
      ['parroquia', 'canton', true],
      ['parroquia', 'provincia', false],
      ['parroquia', 'zona', false],
      ['zona', 'provincia', true],
      ['zona', 'canton', true],
      ['zona', 'parroquia', true],
      ['zona', 'zona', true],
    ])(
      'level matrix: a %s child with a %s parent is valid=%s',
      async (childLevel, parentLevel, isValid) => {
        if (parentLevel !== null) {
          repo.findParentLevel.mockResolvedValue(parentLevel);
        }
        repo.create.mockResolvedValue(makeZone({ level: childLevel as never }));

        const call = service.create({
          name: 'X',
          level: childLevel,
          parent_id: parentLevel === null ? undefined : 'parent-1',
          polygon: { type: 'Polygon', coordinates: [] },
        } as never);

        if (isValid) {
          await expect(call).resolves.toBeDefined();
        } else {
          await expect(call).rejects.toBeInstanceOf(BadRequestException);
        }
      },
    );

    it('maps ST_IsValid=false to 400 INVALID_GEOMETRY carrying ST_IsValidReason verbatim', async () => {
      repo.validateGeometry.mockResolvedValue({
        valid: false,
        reason: 'Self-intersection at or near point -80.7 -2.1',
        empty: false,
        geom_type: 'ST_MultiPolygon',
      });

      await expect(
        service.create({
          name: 'Bowtie',
          level: 'zona',
          polygon: { type: 'Polygon', coordinates: [] },
        } as never),
      ).rejects.toMatchObject({
        message: expect.stringContaining('Self-intersection at or near point -80.7 -2.1'),
      });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('maps ST_IsEmpty=true to 400 EMPTY_GEOMETRY', async () => {
      repo.validateGeometry.mockResolvedValue({
        valid: true,
        reason: null,
        empty: true,
        geom_type: 'ST_MultiPolygon',
      });

      await expect(
        service.create({
          name: 'Empty',
          level: 'zona',
          polygon: { type: 'Polygon', coordinates: [] },
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // Postgres raises rather than returning a row when ST_GeomFromGeoJSON
    // cannot parse the input at all (E7). That throw must surface as a 400,
    // not escape as a 500 — the payload is the caller's fault, not ours.
    it('maps a ST_GeomFromGeoJSON parse failure to 400, not a 500 (E7)', async () => {
      repo.validateGeometry.mockRejectedValue(
        new Error('error: Unknown geometry type: NotAType'),
      );

      const call = service.create({
        name: 'Unparseable',
        level: 'zona',
        polygon: { type: 'NotAType', coordinates: [] },
      } as never);

      await expect(call).rejects.toBeInstanceOf(BadRequestException);
      await expect(call).rejects.toMatchObject({ message: 'Invalid GeoJSON geometry' });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('maps a parse failure on update to 400 as well (E7)', async () => {
      repo.findById.mockResolvedValue(makeZone({ level: 'zona' }));
      repo.validateGeometry.mockRejectedValue(new Error('error: Invalid GeoJSON representation'));

      await expect(
        service.update('zone-1', { polygon: { type: 'Garbage' } } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('purges caches when polygon is supplied', async () => {
      repo.findById.mockResolvedValue(makeZone({ active: true }));
      repo.update.mockResolvedValue(makeZone({ polygon: { type: 'MultiPolygon', coordinates: [[]] } }));

      await service.update('zone-1', { polygon: { type: 'Polygon', coordinates: [] } } as never);

      expect(geofencing.purgeZoneCache).toHaveBeenCalledWith('zone-1');
      expect(geofencing.purgePointCache).toHaveBeenCalled();
    });

    it('purges caches when active actually flips', async () => {
      repo.findById.mockResolvedValue(makeZone({ active: false }));
      repo.update.mockResolvedValue(makeZone({ active: true }));

      await service.update('zone-1', { active: true } as never);

      expect(geofencing.purgeZoneCache).toHaveBeenCalledWith('zone-1');
      expect(geofencing.purgePointCache).toHaveBeenCalled();
    });

    it('does NOT purge caches on a rename-only update', async () => {
      repo.findById.mockResolvedValue(makeZone());
      repo.update.mockResolvedValue(makeZone({ name: 'Renamed' }));

      await service.update('zone-1', { name: 'Renamed' } as never);

      expect(geofencing.purgeZoneCache).not.toHaveBeenCalled();
      expect(geofencing.purgePointCache).not.toHaveBeenCalled();
    });

    it('does NOT purge caches on a level-only or parent_id-only update', async () => {
      repo.findById.mockResolvedValue(makeZone({ level: 'zona' }));
      repo.update.mockResolvedValue(makeZone({ level: 'zona' }));

      await service.update('zone-1', { level: 'zona' } as never);

      expect(geofencing.purgeZoneCache).not.toHaveBeenCalled();
    });

    it('does NOT purge caches when active is set to its current value (no-op flip)', async () => {
      repo.findById.mockResolvedValue(makeZone({ active: true }));
      repo.update.mockResolvedValue(makeZone({ active: true }));

      await service.update('zone-1', { active: true } as never);

      expect(geofencing.purgeZoneCache).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the zone does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.update('missing', { name: 'X' } as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('validates the cycle guard against the target zone id on re-parent', async () => {
      repo.findById.mockResolvedValue(makeZone({ level: 'zona' }));
      repo.findParentLevel.mockResolvedValue('zona');
      repo.update.mockResolvedValue(makeZone({ parent_id: 'other-zone' }));

      await service.update('zone-1', { parent_id: 'other-zone' } as never);

      expect(repo.validateNoCycles).toHaveBeenCalledWith('zone-1', 'other-zone');
    });

    it('throws 400 CYCLIC_PARENT when the cycle guard rejects the proposed parent', async () => {
      repo.findById.mockResolvedValue(makeZone({ level: 'zona' }));
      repo.findParentLevel.mockResolvedValue('zona');
      repo.validateNoCycles.mockResolvedValue(false);

      await expect(
        service.update('zone-1', { parent_id: 'other-zone' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('sets active=false (soft delete) and purges caches when it was previously active', async () => {
      repo.findById.mockResolvedValue(makeZone({ active: true }));
      repo.deactivate.mockResolvedValue({ changed: true });

      await service.delete('zone-1');

      expect(repo.deactivate).toHaveBeenCalledWith('zone-1');
      expect(geofencing.purgeZoneCache).toHaveBeenCalledWith('zone-1');
      expect(geofencing.purgePointCache).toHaveBeenCalled();
    });

    it('is idempotent: no throw and no purge when the zone was already inactive', async () => {
      repo.findById.mockResolvedValue(makeZone({ active: false }));
      repo.deactivate.mockResolvedValue({ changed: false });

      await expect(service.delete('zone-1')).resolves.toBeUndefined();
      expect(geofencing.purgeZoneCache).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the id does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.delete('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.deactivate).not.toHaveBeenCalled();
    });
  });

  describe('deactivating a parent does not cascade', () => {
    it('children keep active=true when their parent is deactivated', async () => {
      // The service only ever issues a single UPDATE against the target
      // zone id — this test documents that no child-touching query is ever
      // built, by asserting the repository is called exactly once per zone.
      repo.findById.mockResolvedValue(makeZone({ id: 'parent-1', active: true }));
      repo.deactivate.mockResolvedValue({ changed: true });

      await service.delete('parent-1');

      expect(repo.deactivate).toHaveBeenCalledTimes(1);
      expect(repo.deactivate).toHaveBeenCalledWith('parent-1');
    });
  });

  describe('findById', () => {
    it('returns the zone even when inactive (200)', async () => {
      repo.findById.mockResolvedValue(makeZone({ active: false }));

      const result = await service.findById('zone-1');

      expect(result.active).toBe(false);
    });

    it('throws NotFoundException when missing (404)', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('delegates to repo.findAll with the given filters', async () => {
      repo.findAll.mockResolvedValue({ items: [makeZone()], total: 1 });

      const result = await service.list({ search: 'Guayas' });

      expect(repo.findAll).toHaveBeenCalledWith({ search: 'Guayas' });
      expect(result.total).toBe(1);
    });
  });

  describe('getTree', () => {
    it('delegates to repo.getSubtree(null) — all zones including inactive', async () => {
      repo.getSubtree.mockResolvedValue([]);

      await service.getTree();

      expect(repo.getSubtree).toHaveBeenCalledWith(null);
    });
  });

  // sc-323-f6 — `CreateGeoZoneDto.polygon` becomes optional (was required
  // with `@IsGeoJsonPolygon()` only). Without `@IsOptional()`, omitting
  // polygon on POST /geo-zones either (a) fails class-validator before the
  // service runs, or (b) crashes the service when validateGeometry hits
  // ST_GeomFromGeoJSON(undefined). Either way the zone can't be created
  // without geometry — the whole point of the change.
  describe('polygon is optional (sc-323-f6)', () => {
    it('creates a zone without polygon and skips PostGIS validation', async () => {
      repo.create.mockResolvedValue(makeZone({ polygon: { type: 'MultiPolygon', coordinates: [] } }));

      await service.create({
        name: 'Sin Geometría',
        level: 'zona',
      } as never);

      expect(repo.validateGeometry).not.toHaveBeenCalled();
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Sin Geometría', polygon: null }),
      );
    });
  });

  // sc-323-f6 — Ecuador bounds check (design.md D3): after ST_IsValid
  // confirms topology, also reject polygons whose centroid is farther
  // than 500 km from the country's centroid (-78.5, -1.5). Peru shapefile
  // by accident = 400, not a zone silently created in the wrong country.
  describe('Ecuador bounds check (sc-323-f6)', () => {
    it('rejects a valid-topology polygon that lies outside Ecuador', async () => {
      repo.validateGeometry.mockResolvedValue({
        valid: true,
        reason: null,
        empty: false,
        geom_type: 'ST_MultiPolygon',
        inBounds: false,
      });

      await expect(
        service.create({
          name: 'Lima',
          level: 'zona',
          polygon: { type: 'Polygon', coordinates: [] },
        } as never),
      ).rejects.toMatchObject({
        message: expect.stringContaining('outside Ecuador'),
      });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('accepts a polygon whose centroid is within 500 km of Ecuador', async () => {
      repo.validateGeometry.mockResolvedValue({
        valid: true,
        reason: null,
        empty: false,
        geom_type: 'ST_MultiPolygon',
        inBounds: true,
      });
      repo.create.mockResolvedValue(makeZone());

      await expect(
        service.create({
          name: 'Pichincha',
          level: 'provincia',
          polygon: { type: 'Polygon', coordinates: [] },
        } as never),
      ).resolves.toBeDefined();
      expect(repo.create).toHaveBeenCalled();
    });
  });
});

// ── importShapefile / getFormData tests (sc-334 Phase 1) ─────────────────────

jest.mock('shpjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const shpjs = require('shpjs') as jest.MockedFunction<(b: ArrayBuffer) => Promise<GeoFeatureCollection>>;

interface GeoFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown> | null;
}

interface GeoFeatureCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

/** Build a minimal GeoJSON feature as shpjs would return it. */
function makeFeature(
  overrides: {
    name?: string;
    code?: string;
    geometry?: object;
  } = {},
): GeoFeature {
  return {
    type: 'Feature',
    geometry: (overrides.geometry ?? { type: 'Polygon', coordinates: [] }) as GeoFeature['geometry'],
    properties: {
      NAME: overrides.name ?? 'Test Zone',
      CODE: overrides.code ?? null,
    },
  };
}

function makeFeatureCollection(features: GeoFeature[]): GeoFeatureCollection {
  return { type: 'FeatureCollection', features };
}

/** Minimal buffer that shpjs would parse — in tests the parse is mocked. */
const DUMMY_BUFFER = Buffer.from('PK');

describe('GeoZonesService.importShapefile (sc-334)', () => {
  let repo: {
    validateGeometry: jest.Mock;
    create: jest.Mock;
    createInTransaction: jest.Mock;
    findByCode: jest.Mock;
    findParentBySpatialContainment: jest.Mock;
    getFormData: jest.Mock;
    update: jest.Mock;
    deactivate: jest.Mock;
    findById: jest.Mock;
    findAll: jest.Mock;
    getSubtree: jest.Mock;
    findParentLevel: jest.Mock;
    validateNoCycles: jest.Mock;
  };
  let geofencing: {
    purgeZoneCache: jest.Mock;
    purgePointCache: jest.Mock;
  };
  let service: GeoZonesService;

  let queryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: { query: jest.Mock };
  };

  let dataSourceMock: { createQueryRunner: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: { query: jest.fn() },
    };

    dataSourceMock = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };

    repo = {
      validateGeometry: jest.fn().mockResolvedValue(VALID_GEOMETRY),
      create: jest.fn(),
      createInTransaction: jest.fn(),
      findByCode: jest.fn().mockResolvedValue(null),
      findParentBySpatialContainment: jest.fn().mockResolvedValue(null),
      getFormData: jest.fn(),
      update: jest.fn(),
      deactivate: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      getSubtree: jest.fn(),
      findParentLevel: jest.fn(),
      validateNoCycles: jest.fn().mockResolvedValue(true),
    };

    geofencing = {
      purgeZoneCache: jest.fn().mockResolvedValue(undefined),
      purgePointCache: jest.fn().mockResolvedValue(undefined),
    };

    service = new GeoZonesService(
      repo as unknown as GeoZonesRepository,
      geofencing as unknown as import('../geofencing/geofencing.service').GeofencingService,
      dataSourceMock as unknown as import('typeorm').DataSource,
    );
  });

  describe('valid batch import', () => {
    it('returns imported=3, skipped=0, errors=[], warnings=[] for 3 valid features', async () => {
      const features = [
        makeFeature({ name: 'Daule', code: 'EC-09-01' }),
        makeFeature({ name: 'Guayaquil', code: 'EC-09-02' }),
        makeFeature({ name: 'Samborondón', code: 'EC-09-03' }),
      ];
      shpjs.mockResolvedValue(makeFeatureCollection(features));
      repo.createInTransaction.mockResolvedValue({ id: 'z1', name: 'Daule' });

      const result = await service.importShapefile(DUMMY_BUFFER, {
        level: 'canton',
        auto_parent: false,
        name_column: 'NAME',
        code_column: 'CODE',
      });

      expect(result.imported).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(repo.createInTransaction).toHaveBeenCalledTimes(3);
      expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('per-feature invalid geometry', () => {
    it('rejects feature with invalid geometry and still inserts valid ones', async () => {
      const features = [
        makeFeature({ name: 'Valid Zone', code: 'EC-01' }),
        makeFeature({ name: 'Bowtie', code: 'EC-02' }),
      ];
      shpjs.mockResolvedValue(makeFeatureCollection(features));

      repo.validateGeometry
        .mockResolvedValueOnce(VALID_GEOMETRY) // feature 0: ok
        .mockResolvedValueOnce({ // feature 1: invalid topology
          valid: false,
          reason: 'Self-intersection',
          empty: false,
          geom_type: 'ST_MultiPolygon',
          inBounds: true,
        });
      repo.createInTransaction.mockResolvedValue({ id: 'z1' });

      const result = await service.importShapefile(DUMMY_BUFFER, {
        level: 'canton',
        auto_parent: false,
        name_column: 'NAME',
        code_column: 'CODE',
      });

      expect(result.imported).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].index).toBe(1);
      expect(result.errors[0].name).toBe('Bowtie');
      expect(result.errors[0].reason).toContain('Invalid geometry');
    });

    it('rejects feature with geometry outside Ecuador bounds', async () => {
      shpjs.mockResolvedValue(makeFeatureCollection([
        makeFeature({ name: 'Lima', code: 'PE-01' }),
      ]));
      repo.validateGeometry.mockResolvedValue({
        valid: true,
        reason: null,
        empty: false,
        geom_type: 'ST_MultiPolygon',
        inBounds: false,
      });

      const result = await service.importShapefile(DUMMY_BUFFER, {
        level: 'canton',
        auto_parent: false,
        name_column: 'NAME',
        code_column: 'CODE',
      });

      expect(result.imported).toBe(0);
      expect(result.errors[0].reason).toContain('outside Ecuador');
    });

    it('rejects feature with empty name', async () => {
      shpjs.mockResolvedValue(makeFeatureCollection([
        makeFeature({ name: '', code: 'EC-01' }),
      ]));

      const result = await service.importShapefile(DUMMY_BUFFER, {
        level: 'canton',
        auto_parent: false,
        name_column: 'NAME',
        code_column: 'CODE',
      });

      expect(result.imported).toBe(0);
      expect(result.errors[0].reason).toMatch(/name/i);
      expect(repo.validateGeometry).not.toHaveBeenCalled();
    });
  });

  describe('duplicate code skip', () => {
    it('counts existing-code features in skipped, not errors', async () => {
      shpjs.mockResolvedValue(makeFeatureCollection([
        makeFeature({ name: 'Guayas', code: 'EC-09' }),
      ]));
      repo.findByCode.mockResolvedValue({ id: 'existing', name: 'Guayas', code: 'EC-09' });

      const result = await service.importShapefile(DUMMY_BUFFER, {
        level: 'provincia',
        auto_parent: false,
        name_column: 'NAME',
        code_column: 'CODE',
      });

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(repo.createInTransaction).not.toHaveBeenCalled();
    });

    it('also skips within-batch duplicate codes (second occurrence of same code)', async () => {
      shpjs.mockResolvedValue(makeFeatureCollection([
        makeFeature({ name: 'First', code: 'EC-DUPE' }),
        makeFeature({ name: 'Second', code: 'EC-DUPE' }),
      ]));
      repo.findByCode.mockResolvedValue(null); // not in DB
      repo.createInTransaction.mockResolvedValue({ id: 'z1' });

      const result = await service.importShapefile(DUMMY_BUFFER, {
        level: 'canton',
        auto_parent: false,
        name_column: 'NAME',
        code_column: 'CODE',
      });

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
    });
  });

  // sc-334 — fixes-required.md W4: assertion that the "parent not found"
  // warning carries a recognizable message so the frontend can render it.
  describe('parent not found warning (sc-334 — W4)', () => {
    beforeEach(() => {
      shpjs.mockResolvedValue(makeFeatureCollection([
        makeFeature({ name: 'Orphan', code: 'EC-ORPHAN' }),
      ]));
      // Both DB lookup (by code) AND spatial containment find nothing.
      repo.findByCode.mockResolvedValue(null);
      repo.findParentBySpatialContainment.mockResolvedValue(null);
      repo.createInTransaction.mockResolvedValue({ id: 'z1' });
    });

    it('pushes a recognizable warning when auto_parent cannot resolve a parent', async () => {
      const result = await service.importShapefile(DUMMY_BUFFER, {
        level: 'canton',
        auto_parent: true,
        name_column: 'NAME',
        code_column: 'CODE',
      });

      expect(result.imported).toBe(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/Orphan/);
      expect(result.warnings[0]).toMatch(/parent/i);
    });

    it('does NOT push the parent-not-found warning when auto_parent=false', async () => {
      const result = await service.importShapefile(DUMMY_BUFFER, {
        level: 'canton',
        auto_parent: false,
        name_column: 'NAME',
        code_column: 'CODE',
      });

      expect(result.imported).toBe(1);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('DB error full rollback', () => {
    it('rolls back and throws when a DB error occurs mid-batch', async () => {
      const features = [
        makeFeature({ name: 'A', code: 'EC-01' }),
        makeFeature({ name: 'B', code: 'EC-02' }),
      ];
      shpjs.mockResolvedValue(makeFeatureCollection(features));
      repo.createInTransaction
        .mockResolvedValueOnce({ id: 'z1' })
        .mockRejectedValueOnce(new Error('constraint violation'));

      await expect(
        service.importShapefile(DUMMY_BUFFER, {
          level: 'canton',
          auto_parent: false,
          name_column: 'NAME',
          code_column: 'CODE',
        }),
      ).rejects.toThrow();

      expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    });
  });
});

describe('GeoZonesService.getFormData (sc-334)', () => {
  let repo: { getFormData: jest.Mock } & Record<string, jest.Mock>;
  let geofencing: { purgeZoneCache: jest.Mock; purgePointCache: jest.Mock };
  let service: GeoZonesService;

  beforeEach(() => {
    repo = {
      validateGeometry: jest.fn(),
      create: jest.fn(),
      createInTransaction: jest.fn(),
      findByCode: jest.fn(),
      findParentBySpatialContainment: jest.fn(),
      getFormData: jest.fn(),
      update: jest.fn(),
      deactivate: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      getSubtree: jest.fn(),
      findParentLevel: jest.fn(),
      validateNoCycles: jest.fn(),
    };
    geofencing = {
      purgeZoneCache: jest.fn(),
      purgePointCache: jest.fn(),
    };
    service = new GeoZonesService(
      repo as unknown as GeoZonesRepository,
      geofencing as unknown as import('../geofencing/geofencing.service').GeofencingService,
    );
  });

  it('delegates to repo.getFormData and returns levels + parents', async () => {
    repo.getFormData.mockResolvedValue([
      { id: 'z1', name: 'Azuay', code: 'EC-01', level: 'canton' },
    ]);

    const result = await service.getFormData();

    expect(repo.getFormData).toHaveBeenCalledTimes(1);
    expect(result.levels).toEqual(expect.arrayContaining(['cantón', 'parroquia', 'provincia', 'sector']));
    expect(result.parents).toHaveLength(1);
    expect(result.parents[0].name).toBe('Azuay');
  });

  it('returns empty parents array when no active zones exist', async () => {
    repo.getFormData.mockResolvedValue([]);

    const result = await service.getFormData();

    expect(result.parents).toHaveLength(0);
    expect(result.levels).toHaveLength(4);
  });
});
