import { GeoZonesController } from './geo-zones.controller';
import { GeoZonesService } from './geo-zones.service';

function makeZone(overrides: Record<string, unknown> = {}) {
  return {
    id: 'zone-1',
    name: 'Guayas',
    parent_id: null,
    level: 'provincia',
    active: true,
    polygon: { type: 'MultiPolygon', coordinates: [] },
    created_at: new Date(),
    ...overrides,
  };
}

describe('GeoZonesController', () => {
  let service: {
    getTree: jest.Mock;
    list: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let controller: GeoZonesController;

  beforeEach(() => {
    service = {
      getTree: jest.fn(),
      list: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    controller = new GeoZonesController(service as unknown as GeoZonesService);
  });

  it('GET /tree delegates to service.getTree() and returns entities directly (no {data} envelope)', async () => {
    const zone = makeZone();
    service.getTree.mockResolvedValue([zone]);

    const result = await controller.getTree();

    expect(service.getTree).toHaveBeenCalled();
    expect(result).toEqual([zone]);
  });

  it('GET / delegates to service.list() with parsed query params and returns {items, total}', async () => {
    service.list.mockResolvedValue({ items: [], total: 0 });

    const result = await controller.list('Guayas', undefined, undefined, 'true', undefined, '2', '5');

    expect(service.list).toHaveBeenCalledWith({
      search: 'Guayas',
      parentId: undefined,
      level: undefined,
      includeInactive: true,
      code: undefined,
      page: 2,
      perPage: 5,
    });
    expect(result).toEqual({ items: [], total: 0 });
  });

  it('GET / forwards the `code` query param for exact-match filtering (T7.6.A7)', async () => {
    service.list.mockResolvedValue({ items: [makeZone({ code: 'SE-01' })], total: 1 });

    await controller.list(undefined, undefined, undefined, undefined, 'SE-01');

    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SE-01' }),
    );
  });

  it('GET / passes parentId=null when the query string literal is "null" (roots only)', async () => {
    service.list.mockResolvedValue({ items: [], total: 0 });

    await controller.list(undefined, 'null', undefined, undefined, undefined, undefined);

    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: null }),
    );
  });

  it('GET /:id delegates to service.findById()', async () => {
    service.findById.mockResolvedValue(makeZone());

    const result = await controller.findOne('zone-1');

    expect(service.findById).toHaveBeenCalledWith('zone-1');
    expect(result.id).toBe('zone-1');
  });

  it('POST / delegates to service.create()', async () => {
    service.create.mockResolvedValue(makeZone());

    const dto = { name: 'Guayas', level: 'provincia', polygon: { type: 'Polygon', coordinates: [] } };
    const result = await controller.create(dto as never);

    expect(service.create).toHaveBeenCalledWith(dto);
    expect(result.name).toBe('Guayas');
  });

  it('PATCH /:id delegates to service.update()', async () => {
    service.update.mockResolvedValue(makeZone({ name: 'Updated' }));

    const result = await controller.update('zone-1', { name: 'Updated' } as never);

    expect(service.update).toHaveBeenCalledWith('zone-1', { name: 'Updated' });
    expect(result.name).toBe('Updated');
  });

  it('DELETE /:id delegates to service.delete() and returns void (204)', async () => {
    service.delete.mockResolvedValue(undefined);

    const result = await controller.remove('zone-1');

    expect(service.delete).toHaveBeenCalledWith('zone-1');
    expect(result).toBeUndefined();
  });

  it('propagates service.findById 404 unchanged (missing zone)', async () => {
    const notFound = new Error('Zone not found');
    service.findById.mockRejectedValue(notFound);

    await expect(controller.findOne('missing')).rejects.toBe(notFound);
  });
});
