import { BadRequestException, NotFoundException } from '@nestjs/common';

import { OrganizationRow, OrganizationsRepository } from './organizations.repository';
import { OrganizationsService } from './organizations.service';
import { GeofencingService } from '../geofencing/geofencing.service';

function makeOrg(overrides: Partial<OrganizationRow> = {}): OrganizationRow {
  return {
    id: 'org-1',
    name: 'Santa Elena',
    zone_id: 'zone-1',
    max_active_claims: 5,
    created_at: new Date('2026-01-01T00:00:00Z'),
    parent_id: null,
    incident_category_id: null,
    ...overrides,
  };
}

describe('OrganizationsService', () => {
  let repo: {
    create: jest.Mock;
    update: jest.Mock;
    updateCategory: jest.Mock;
    delete: jest.Mock;
    findById: jest.Mock;
    findAll: jest.Mock;
    findNotifiedFor: jest.Mock;
  };
  let geofencing: { resolveZone: jest.Mock };
  let orgRepo: { find: jest.Mock };
  let service: OrganizationsService;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      update: jest.fn(),
      updateCategory: jest.fn(),
      delete: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      findNotifiedFor: jest.fn(),
    };
    geofencing = { resolveZone: jest.fn() };
    orgRepo = { find: jest.fn() };
    service = new OrganizationsService(
      repo as unknown as OrganizationsRepository,
      orgRepo as never,
      { find: jest.fn() } as never,
      geofencing as unknown as GeofencingService,
    );
  });

  describe('create', () => {
    it('delegates to the repository and returns the created row', async () => {
      const created = makeOrg();
      repo.create.mockResolvedValue(created);

      const result = await service.create({ name: 'Santa Elena', zone_id: 'zone-1' });

      expect(repo.create).toHaveBeenCalledWith({
        name: 'Santa Elena',
        zoneId: 'zone-1',
        parentId: null,
      });
      expect(result).toEqual(created);
    });

    it('passes parent_id through when creating a branch', async () => {
      repo.create.mockResolvedValue(makeOrg({ parent_id: 'org-root' }));

      await service.create({ name: 'Sucursal', zone_id: 'zone-1', parent_id: 'org-root' });

      expect(repo.create).toHaveBeenCalledWith({
        name: 'Sucursal',
        zoneId: 'zone-1',
        parentId: 'org-root',
      });
    });
  });

  describe('findById', () => {
    it('returns the row when found', async () => {
      const org = makeOrg();
      repo.findById.mockResolvedValue(org);

      await expect(service.findById('org-1')).resolves.toEqual(org);
    });

    it('throws 404 NotFoundException when missing', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates and returns the row', async () => {
      const updated = makeOrg({ name: 'Renamed' });
      repo.update.mockResolvedValue(updated);

      const result = await service.update('org-1', { name: 'Renamed' });

      expect(result).toEqual(updated);
    });

    it('throws 404 when the target row does not exist', async () => {
      repo.update.mockResolvedValue(null);

      await expect(service.update('missing', { name: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    // ---- T7.5.B1/B3 — indirect cycle detection ---------------------------

    it('rejects an indirect cycle (A→B→A) when assigning a parent', async () => {
      // org-A wants parent_id = org-B, but org-B's parent is already org-A.
      repo.findById.mockImplementation((id: string) => {
        if (id === 'org-B') return Promise.resolve(makeOrg({ id: 'org-B', parent_id: 'org-A' }));
        return Promise.resolve(null);
      });

      await expect(
        service.update('org-A', { parent_id: 'org-B' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('accepts a valid, acyclic parent assignment', async () => {
      repo.findById.mockResolvedValue(makeOrg({ id: 'org-root', parent_id: null }));
      repo.update.mockResolvedValue(makeOrg({ parent_id: 'org-root' }));

      const result = await service.update('org-1', { parent_id: 'org-root' });

      expect(result.parent_id).toBe('org-root');
    });
  });

  describe('assignCategory (T7.5.C6)', () => {
    it('delegates to repo.updateCategory and returns the updated row', async () => {
      const updated = makeOrg({ incident_category_id: 'cat-1' });
      repo.updateCategory.mockResolvedValue(updated);

      const result = await service.assignCategory('org-1', 'cat-1');

      expect(repo.updateCategory).toHaveBeenCalledWith('org-1', 'cat-1');
      expect(result).toEqual(updated);
    });

    it('throws 404 when the org does not exist', async () => {
      repo.updateCategory.mockResolvedValue(null);

      await expect(service.assignCategory('missing', 'cat-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('deletes an existing row', async () => {
      repo.findById.mockResolvedValue(makeOrg());
      repo.delete.mockResolvedValue(true);

      await expect(service.delete('org-1')).resolves.toBeUndefined();
      expect(repo.delete).toHaveBeenCalledWith('org-1');
    });

    it('throws 404 when the row does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.delete('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('delegates to repo.findAll', async () => {
      repo.findAll.mockResolvedValue({ items: [makeOrg()], total: 1 });

      const result = await service.list({ page: 1, perPage: 15 });

      expect(result).toEqual({ items: [makeOrg()], total: 1 });
    });
  });

  // ---- T7.5.B1/B2 — tree() built from parent_id -----------------------------

  describe('tree', () => {
    it('nests children under their parent by parent_id', async () => {
      orgRepo.find.mockResolvedValue([
        { id: 'root', name: 'Root', zoneId: 'zone-1', parentId: null },
        { id: 'child-1', name: 'Child 1', zoneId: 'zone-1', parentId: 'root' },
        { id: 'child-2', name: 'Child 2', zoneId: 'zone-1', parentId: 'root' },
      ]);

      const result = await service.tree();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('root');
      expect(result[0].children.map((c) => c.id).sort()).toEqual(['child-1', 'child-2']);
    });

    it('returns a flat list of roots when no org has a parent', async () => {
      orgRepo.find.mockResolvedValue([
        { id: 'a', name: 'A', zoneId: null, parentId: null },
        { id: 'b', name: 'B', zoneId: null, parentId: null },
      ]);

      const result = await service.tree();

      expect(result.map((n) => n.id).sort()).toEqual(['a', 'b']);
      expect(result.every((n) => n.children.length === 0)).toBe(true);
    });
  });

  // ---- T7.5.C1 — findNotifiedFor / notifiedFor (R11.3–R11.10) ---------------

  describe('findNotifiedFor', () => {
    it('delegates to the repository', async () => {
      const orgs = [makeOrg()];
      repo.findNotifiedFor.mockResolvedValue(orgs);

      const result = await service.findNotifiedFor('zone-1', 'cat-1');

      expect(repo.findNotifiedFor).toHaveBeenCalledWith('zone-1', 'cat-1');
      expect(result).toEqual(orgs);
    });

    it('short-circuits to [] without querying when zoneId is null', async () => {
      const result = await service.findNotifiedFor(null, 'cat-1');

      expect(result).toEqual([]);
      expect(repo.findNotifiedFor).not.toHaveBeenCalled();
    });
  });

  describe('notifiedFor', () => {
    const ZONE_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

    it('(a) location_id → resolves zone by ID, passes category_id through', async () => {
      const orgs = [makeOrg({ id: 'org-1' })];
      repo.findNotifiedFor.mockResolvedValue(orgs);

      const result = await service.notifiedFor({ location_id: ZONE_UUID, category_id: 'cat-1' });

      expect(repo.findNotifiedFor).toHaveBeenCalledWith(ZONE_UUID, 'cat-1');
      expect(geofencing.resolveZone).not.toHaveBeenCalled();
      expect(result).toEqual([{ ...orgs[0], is_claimable: true }]);
    });

    it('(b) lat+lng → geofencing path, category_id absent → passes null', async () => {
      const orgs = [makeOrg({ id: 'org-1' })];
      geofencing.resolveZone.mockResolvedValue({ zone: { id: ZONE_UUID }, zone_id: ZONE_UUID });
      repo.findNotifiedFor.mockResolvedValue(orgs);

      const result = await service.notifiedFor({ lat: -2.2, lng: -80.5 });

      expect(geofencing.resolveZone).toHaveBeenCalledWith({ lat: -2.2, lng: -80.5 });
      expect(repo.findNotifiedFor).toHaveBeenCalledWith(ZONE_UUID, null);
      expect(result).toEqual([{ ...orgs[0], is_claimable: true }]);
    });

    it('(c) no params → throws BadRequestException', async () => {
      await expect(service.notifiedFor({})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('(d) no organizations cover the pair → returns empty array (R11.8)', async () => {
      repo.findNotifiedFor.mockResolvedValue([]);

      const result = await service.notifiedFor({ location_id: ZONE_UUID });

      expect(result).toEqual([]);
    });

    it('(e) R11.7 — is_claimable is true only on the first (stable order), false on the rest', async () => {
      const orgs = [
        makeOrg({ id: 'org-1' }),
        makeOrg({ id: 'org-2' }),
        makeOrg({ id: 'org-3' }),
      ];
      repo.findNotifiedFor.mockResolvedValue(orgs);

      const result = await service.notifiedFor({ location_id: ZONE_UUID });

      expect(result.map((o) => o.is_claimable)).toEqual([true, false, false]);
      expect(result.filter((o) => o.is_claimable)).toHaveLength(1);
    });
  });
});
