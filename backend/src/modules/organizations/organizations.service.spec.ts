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
    ...overrides,
  };
}

describe('OrganizationsService', () => {
  let repo: {
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    findById: jest.Mock;
    findAll: jest.Mock;
    findByZone: jest.Mock;
  };
  let geofencing: { resolveZone: jest.Mock };
  let service: OrganizationsService;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      findByZone: jest.fn(),
    };
    geofencing = { resolveZone: jest.fn() };
    service = new OrganizationsService(
      repo as unknown as OrganizationsRepository,
      { find: jest.fn() } as never,
      { find: jest.fn() } as never,
      geofencing as unknown as GeofencingService,
    );
  });

  describe('create', () => {
    it('delegates to the repository and returns the created row', async () => {
      const created = makeOrg();
      repo.create.mockResolvedValue(created);

      const result = await service.create({ name: 'Santa Elena', zone_id: 'zone-1' });

      expect(repo.create).toHaveBeenCalledWith({ name: 'Santa Elena', zoneId: 'zone-1' });
      expect(result).toEqual(created);
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

  describe('findByZone', () => {
    it('returns the single org for a zone', async () => {
      const org = makeOrg();
      repo.findByZone.mockResolvedValue(org);

      await expect(service.findByZone('zone-1')).resolves.toEqual(org);
    });

    it('returns null when the zone has no organization', async () => {
      repo.findByZone.mockResolvedValue(null);

      await expect(service.findByZone('zone-9')).resolves.toBeNull();
    });

    it('returns null when zoneId itself is null', async () => {
      await expect(service.findByZone(null)).resolves.toBeNull();
      expect(repo.findByZone).not.toHaveBeenCalled();
    });
  });

  // ---- T6.1.B — notifiedFor dual-input ----------------------------------------

  describe('notifiedFor', () => {
    const ZONE_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

    it('(a) location_id → resolves zone by ID and returns org with is_claimable', async () => {
      const org = makeOrg({ zone_id: ZONE_UUID, max_active_claims: 5 });
      repo.findByZone.mockResolvedValue(org);

      const result = await service.notifiedFor({ location_id: ZONE_UUID });

      expect(repo.findByZone).toHaveBeenCalledWith(ZONE_UUID);
      expect(geofencing.resolveZone).not.toHaveBeenCalled();
      expect(result).toEqual([{ ...org, is_claimable: true }]);
    });

    it('(b) lat+lng → geofencing path returns org with is_claimable', async () => {
      const org = makeOrg({ zone_id: ZONE_UUID, max_active_claims: 3 });
      geofencing.resolveZone.mockResolvedValue({ zone: { id: ZONE_UUID }, zone_id: ZONE_UUID });
      repo.findByZone.mockResolvedValue(org);

      const result = await service.notifiedFor({ lat: -2.2, lng: -80.5 });

      expect(geofencing.resolveZone).toHaveBeenCalledWith({ lat: -2.2, lng: -80.5 });
      expect(repo.findByZone).toHaveBeenCalledWith(ZONE_UUID);
      expect(result).toEqual([{ ...org, is_claimable: true }]);
    });

    it('(c) no params → throws BadRequestException', async () => {
      await expect(service.notifiedFor({})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('(d) location_id not found → returns empty array', async () => {
      repo.findByZone.mockResolvedValue(null);

      const result = await service.notifiedFor({ location_id: ZONE_UUID });

      expect(result).toEqual([]);
    });

    it('(e) max_active_claims = 0 → is_claimable = false', async () => {
      const org = makeOrg({ max_active_claims: 0 });
      repo.findByZone.mockResolvedValue(org);

      const result = await service.notifiedFor({ location_id: ZONE_UUID });

      expect(result[0].is_claimable).toBe(false);
    });
  });
});
