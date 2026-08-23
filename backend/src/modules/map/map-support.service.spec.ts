import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { IncidentCategoryEntity } from '../../entities/incident-category.entity';
import { MapSupportService } from './map-support.service';

describe('MapSupportService.getMapFilters', () => {
  function makeRepo(rows: Array<{ id: string; name: string }>) {
    return {
      find: jest.fn().mockResolvedValue(rows),
    } as unknown as Repository<IncidentCategoryEntity>;
  }

  it('returns categories as the repository hands them back (DB does the ASC sort, not the service)', async () => {
    // The service does NOT sort in memory — it asks the DB via
    // `order: { name: 'ASC' }` and trusts the result. This test pins the
    // call args and the pass-through behaviour.
    const repo = makeRepo([
      { id: 'c1', name: 'Accidente' },
      { id: 'c2', name: 'Bloqueo' },
      { id: 'c3', name: 'Choque' },
    ]);
    const module = await Test.createTestingModule({
      providers: [
        MapSupportService,
        { provide: getRepositoryToken(IncidentCategoryEntity), useValue: repo },
      ],
    }).compile();
    const svc = module.get(MapSupportService);
    const res = await svc.getMapFilters();
    expect(res.data.categories.map((c) => c.name)).toEqual(['Accidente', 'Bloqueo', 'Choque']);
  });

  it('returns an empty array when no categories exist', async () => {
    const repo = makeRepo([]);
    const module = await Test.createTestingModule({
      providers: [
        MapSupportService,
        { provide: getRepositoryToken(IncidentCategoryEntity), useValue: repo },
      ],
    }).compile();
    const svc = module.get(MapSupportService);
    const res = await svc.getMapFilters();
    expect(res.data.categories).toEqual([]);
  });

  it('queries only id and name columns', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const repo = { find } as unknown as Repository<IncidentCategoryEntity>;
    const module = await Test.createTestingModule({
      providers: [
        MapSupportService,
        { provide: getRepositoryToken(IncidentCategoryEntity), useValue: repo },
      ],
    }).compile();
    const svc = module.get(MapSupportService);
    await svc.getMapFilters();
    expect(find).toHaveBeenCalledWith({ select: ['id', 'name'], order: { name: 'ASC' } });
  });
});
