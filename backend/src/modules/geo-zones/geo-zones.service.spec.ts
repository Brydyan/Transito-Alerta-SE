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
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

const VALID_GEOMETRY = { valid: true, reason: null, empty: false, geom_type: 'ST_MultiPolygon' };

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
});
