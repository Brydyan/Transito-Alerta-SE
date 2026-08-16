import { Reflector } from '@nestjs/core';
import { CommentsController, AuthenticatedRequest } from './comments.controller';
import { CommentsService } from './comments.service';
import { REQUIRE_PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

describe('CommentsController', () => {
  let service: {
    create: jest.Mock;
    findByIncident: jest.Mock;
    delete: jest.Mock;
  };
  let controller: CommentsController;

  beforeEach(() => {
    service = { create: jest.fn(), findByIncident: jest.fn(), delete: jest.fn() };
    controller = new CommentsController(service as unknown as CommentsService);
  });

  it('POST / requires CREATE comments (anonymous ceiling includes this)', () => {
    const reflector = new Reflector();
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.create);
    expect(meta).toEqual({ action: 'CREATE', resource: undefined });
  });

  it('DELETE /:id requires DELETE comments (anonymous does NOT hold this)', () => {
    const reflector = new Reflector();
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.remove);
    expect(meta).toEqual({ action: 'DELETE', resource: undefined });
  });

  it('POST / delegates to service.create with the authenticated user id', async () => {
    service.create.mockResolvedValue({ id: 'c-1' });
    const req = { user: { userId: 'user-1', permissions: [] } } as unknown as AuthenticatedRequest;

    const result = await controller.create({ incident_id: 'inc-1', content: 'hi' } as unknown as Parameters<typeof controller.create>[0], req);

    expect(service.create).toHaveBeenCalledWith(
      { incident_id: 'inc-1', content: 'hi' },
      'user-1',
    );
    expect(result).toEqual({ id: 'c-1' });
  });

  it('GET /incident/:incidentId delegates to service.findByIncident', async () => {
    service.findByIncident.mockResolvedValue([]);

    await controller.findByIncident('inc-1');

    expect(service.findByIncident).toHaveBeenCalledWith('inc-1');
  });

  it('DELETE /:id delegates to service.delete with the requester id', async () => {
    const req = { user: { userId: 'user-1', permissions: [] } } as unknown as AuthenticatedRequest;

    await controller.remove('c-1', req);

    expect(service.delete).toHaveBeenCalledWith('c-1', 'user-1');
  });
});
