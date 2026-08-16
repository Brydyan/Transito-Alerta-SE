import { Reflector } from '@nestjs/core';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { REQUIRE_PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

describe('IncidentsController', () => {
  let service: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    updateStatus: jest.Mock;
  };
  let controller: IncidentsController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      updateStatus: jest.fn(),
    };
    controller = new IncidentsController(service as unknown as IncidentsService);
  });

  it('POST / requires CREATE incidents permission (anonymous ceiling includes this)', () => {
    const reflector = new Reflector();
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.create);
    expect(meta).toEqual({ action: 'CREATE', resource: undefined });
  });

  it('PATCH /:id/status requires UPDATE incidents permission', () => {
    const reflector = new Reflector();
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.updateStatus);
    expect(meta).toEqual({ action: 'UPDATE', resource: undefined });
  });

  it('POST / delegates to service.create with the authenticated citizen id', async () => {
    service.create.mockResolvedValue({ id: 'inc-1' });
    const req = { user: { userId: 'user-1', permissions: [] } } as unknown as Express.Request;

    const result = await controller.create({ title: 'x', lat: -2.2, lng: -80.8 } as unknown as Parameters<typeof controller.create>[0], req);

    expect(service.create).toHaveBeenCalledWith(
      { title: 'x', lat: -2.2, lng: -80.8 },
      'user-1',
    );
    expect(result).toEqual({ id: 'inc-1' });
  });

  it('GET / delegates to service.findAll with query filters', async () => {
    service.findAll.mockResolvedValue([]);

    await controller.findAll('zone-1', 'pending');

    expect(service.findAll).toHaveBeenCalledWith('zone-1', 'pending');
  });

  it('GET /:id delegates to service.findOne', async () => {
    service.findOne.mockResolvedValue({ id: 'inc-1' });

    const result = await controller.findOne('inc-1');

    expect(service.findOne).toHaveBeenCalledWith('inc-1');
    expect(result).toEqual({ id: 'inc-1' });
  });

  it('PATCH /:id/status delegates to service.updateStatus with the actor id', async () => {
    service.updateStatus.mockResolvedValue({ id: 'inc-1', status: 'in_progress' });
    const req = { user: { userId: 'operator-1', permissions: [] } } as unknown as Express.Request;

    const result = await controller.updateStatus('inc-1', { status: 'in_progress' } as unknown as Parameters<typeof controller.updateStatus>[1], req);

    expect(service.updateStatus).toHaveBeenCalledWith('inc-1', 'in_progress', 'operator-1');
    expect(result).toEqual({ id: 'inc-1', status: 'in_progress' });
  });
});
