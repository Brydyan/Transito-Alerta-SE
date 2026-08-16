import { Reflector } from '@nestjs/core';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { REQUIRE_PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

describe('AssignmentsController', () => {
  let service: { assign: jest.Mock; release: jest.Mock; list: jest.Mock };
  let controller: AssignmentsController;

  beforeEach(() => {
    service = { assign: jest.fn(), release: jest.fn(), list: jest.fn() };
    controller = new AssignmentsController(service as unknown as AssignmentsService);
  });

  it('POST / requires ASSIGN permission', () => {
    const reflector = new Reflector();
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.assign);
    expect(meta).toEqual({ action: 'ASSIGN', resource: undefined });
  });

  it('POST / delegates to service.assign', async () => {
    service.assign.mockResolvedValue({ id: 'a-1' });

    const result = await controller.assign({
      incident_id: 'inc-1',
      operator_id: 'op-1',
      role: 'primary',
    } as unknown as Parameters<typeof controller.assign>[0]);

    expect(service.assign).toHaveBeenCalledWith('inc-1', 'op-1', 'primary');
    expect(result).toEqual({ id: 'a-1' });
  });

  it('DELETE /:id delegates to service.release', async () => {
    await controller.release('a-1');
    expect(service.release).toHaveBeenCalledWith('a-1');
  });

  it('GET /incident/:incidentId delegates to service.list', async () => {
    service.list.mockResolvedValue([]);
    await controller.list('inc-1');
    expect(service.list).toHaveBeenCalledWith('inc-1');
  });
});
