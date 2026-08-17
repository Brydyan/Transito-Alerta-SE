import { IncidentCategoriesController } from './incident-categories.controller';
import { IncidentCategoriesService } from './incident-categories.service';

function makeCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cat-1',
    name: 'Traffic',
    parentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('IncidentCategoriesController', () => {
  let service: {
    getTree: jest.Mock;
    list: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let controller: IncidentCategoriesController;

  beforeEach(() => {
    service = {
      getTree: jest.fn(),
      list: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    controller = new IncidentCategoriesController(
      service as unknown as IncidentCategoriesService,
    );
  });

  it('GET /tree delegates to service.getTree()', async () => {
    service.getTree.mockResolvedValue([]);

    const result = await controller.getTree();

    expect(service.getTree).toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('GET / delegates to service.list() with parsed query params', async () => {
    service.list.mockResolvedValue({ items: [], total: 0 });

    await controller.list('Inci', 'root-1', '2', '5');

    expect(service.list).toHaveBeenCalledWith({
      search: 'Inci',
      parentId: 'root-1',
      page: 2,
      perPage: 5,
    });
  });

  it('GET / passes parentId=null when the query string literal is "null" (roots only)', async () => {
    service.list.mockResolvedValue({ items: [], total: 0 });

    await controller.list(undefined, 'null', undefined, undefined);

    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: null }),
    );
  });

  it('GET /:id delegates to service.findById()', async () => {
    service.findById.mockResolvedValue(makeCategory());

    const result = await controller.findOne('cat-1');

    expect(service.findById).toHaveBeenCalledWith('cat-1');
    expect(result.id).toBe('cat-1');
  });

  it('POST / delegates to service.create()', async () => {
    service.create.mockResolvedValue(makeCategory());

    const result = await controller.create({ name: 'Traffic' });

    expect(service.create).toHaveBeenCalledWith({ name: 'Traffic' });
    expect(result.name).toBe('Traffic');
  });

  it('PATCH /:id delegates to service.update()', async () => {
    service.update.mockResolvedValue(makeCategory({ name: 'Updated' }));

    const result = await controller.update('cat-1', { name: 'Updated' });

    expect(service.update).toHaveBeenCalledWith('cat-1', { name: 'Updated' });
    expect(result.name).toBe('Updated');
  });

  it('DELETE /:id delegates to service.delete() and returns void (204)', async () => {
    service.delete.mockResolvedValue(undefined);

    const result = await controller.remove('cat-1');

    expect(service.delete).toHaveBeenCalledWith('cat-1');
    expect(result).toBeUndefined();
  });

  it('propagates service.findById 404 unchanged (missing category)', async () => {
    const notFound = new Error('Category not found');
    service.findById.mockRejectedValue(notFound);

    await expect(controller.findOne('missing')).rejects.toBe(notFound);
  });
});
