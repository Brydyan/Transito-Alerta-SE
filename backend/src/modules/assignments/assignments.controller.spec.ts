import { Reflector } from '@nestjs/core';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { REQUIRE_PERMISSION_KEY } from '../../shared/decorators/require-permission.decorator';
import { AuthenticatedRequest } from '../../shared/interfaces/authenticated-request';

const GLOBAL_SCOPE = { kind: 'global' as const };

describe('AssignmentsController', () => {
  let service: {
    assign: jest.Mock;
    release: jest.Mock;
    list: jest.Mock;
    update: jest.Mock;
  };
  let controller: AssignmentsController;

  beforeEach(() => {
    service = {
      assign: jest.fn(),
      release: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
    };
    controller = new AssignmentsController(service as unknown as AssignmentsService);
  });

  it('POST / requires ASSIGN permission', () => {
    const reflector = new Reflector();
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.assign);
    expect(meta).toEqual({ action: 'ASSIGN', resource: undefined });
  });

  it('POST / delegates to service.assign with caller + override options', async () => {
    service.assign.mockResolvedValue({ id: 'a-1' });
    const req = {
      user: {
        userId: 'admin-1',
        permissions: ['ASSIGN assignments'],
        scope: GLOBAL_SCOPE,
        roleName: 'admin_org',
        organizationId: 'org-A',
        sessionId: null,
        isAnonymous: false,
      },
    } as unknown as AuthenticatedRequest;

    await controller.assign(
      {
        incident_id: 'inc-1',
        operator_id: 'op-1',
        role: 'primary',
        override_cap: true,
        override_reason: 'fire on 5th and main',
      } as unknown as Parameters<typeof controller.assign>[0],
      req,
    );

    expect(service.assign).toHaveBeenCalledWith(
      'inc-1',
      'op-1',
      'primary',
      req.user,
      { overrideCap: true, overrideReason: 'fire on 5th and main' },
    );
  });

  it('DELETE /:id delegates to service.release with the caller', async () => {
    const req = {
      user: {
        userId: 'admin-1',
        permissions: ['ASSIGN assignments'],
        scope: GLOBAL_SCOPE,
        roleName: 'admin_org',
        organizationId: 'org-A',
        sessionId: null,
        isAnonymous: false,
      },
    } as unknown as AuthenticatedRequest;

    await controller.release('a-1', req);

    expect(service.release).toHaveBeenCalledWith('a-1', req.user);
  });

  it('GET /incident/:incidentId delegates to service.list with the caller scope', async () => {
    service.list.mockResolvedValue([]);
    const req = {
      user: { userId: 'user-1', permissions: [], scope: GLOBAL_SCOPE },
    } as unknown as AuthenticatedRequest;
    await controller.list('inc-1', req);
    expect(service.list).toHaveBeenCalledWith('inc-1', GLOBAL_SCOPE);
  });

  it('PATCH /:id delegates to service.update with the caller + override options', async () => {
    service.update.mockResolvedValue({ id: 'a-1' });
    const req = {
      user: {
        userId: 'admin-1',
        permissions: ['UPDATE assignments'],
        scope: GLOBAL_SCOPE,
        roleName: 'admin_org',
        organizationId: 'org-A',
        sessionId: null,
        isAnonymous: false,
      },
    } as unknown as AuthenticatedRequest;

    await controller.update(
      'a-1',
      {
        operator_id: 'op-2',
        override_cap: true,
        override_reason: 'all ops at cap, one extra needed',
      } as unknown as Parameters<typeof controller.update>[1],
      req,
    );

    expect(service.update).toHaveBeenCalledWith(
      'a-1',
      { operator_id: 'op-2', role: undefined },
      req.user,
      { overrideCap: true, overrideReason: 'all ops at cap, one extra needed' },
    );
  });
});
