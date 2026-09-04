import { Reflector } from '@nestjs/core';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { IncidentAnalyticsService } from './incident-analytics.service';
import { IncidentFeedService } from './incident-feed.service';
import { IncidentExportService } from './incident-export.service';
import { FeedRecoveryService } from './feed-recovery.service';
import { IncidentWorkflowService } from './incident-workflow.service';
import { REQUIRE_PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';

const GLOBAL_SCOPE = { kind: 'global' as const };

describe('IncidentsController', () => {
  let service: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    updateStatus: jest.Mock;
  };
  let workflow: { changeStatus: jest.Mock };
  let controller: IncidentsController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      updateStatus: jest.fn(),
    };
    // sc-315 — el controller delega PATCH /:id/status al workflow service.
    workflow = { changeStatus: jest.fn() };
    controller = new IncidentsController(
      service as unknown as IncidentsService,
      {} as IncidentAnalyticsService,
      {} as IncidentFeedService,
      {} as IncidentExportService,
      {} as FeedRecoveryService,
      workflow as unknown as IncidentWorkflowService,
    );
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
    const req = {
      user: { userId: 'user-1', permissions: [], scope: GLOBAL_SCOPE },
    } as unknown as AuthenticatedRequest;

    const result = await controller.create({ title: 'x', lat: -2.2, lng: -80.8 } as unknown as Parameters<typeof controller.create>[0], req);

    expect(service.create).toHaveBeenCalledWith(
      { title: 'x', lat: -2.2, lng: -80.8 },
      'user-1',
    );
    expect(result).toEqual({ id: 'inc-1' });
  });

  it('GET / delegates to service.findAll with query filters and the caller scope', async () => {
    service.findAll.mockResolvedValue([]);
    const req = {
      user: { userId: 'user-1', permissions: [], scope: GLOBAL_SCOPE },
    } as unknown as AuthenticatedRequest;

    await controller.findAll(req, 'zone-1', 'pending');

    expect(service.findAll).toHaveBeenCalledWith('zone-1', 'pending', GLOBAL_SCOPE);
  });

  it('GET /:id delegates to service.findOne with the caller scope', async () => {
    service.findOne.mockResolvedValue({ id: 'inc-1' });
    const req = {
      user: { userId: 'user-1', permissions: [], scope: GLOBAL_SCOPE },
    } as unknown as AuthenticatedRequest;

    const result = await controller.findOne('inc-1', req);

    expect(service.findOne).toHaveBeenCalledWith('inc-1', GLOBAL_SCOPE);
    expect(result).toEqual({ id: 'inc-1' });
  });

  it('PATCH /:id/status delegates to workflow.changeStatus with the actor id, permissions, and closed_reason (sc-315)', async () => {
    workflow.changeStatus.mockResolvedValue({ id: 'inc-1', status: 'in_progress' });
    const req = {
      user: {
        userId: 'operator-1',
        permissions: ['UPDATE incidents'],
        scope: GLOBAL_SCOPE,
      },
    } as unknown as AuthenticatedRequest;

    const result = await controller.updateStatus(
      'inc-1',
      { status: 'in_progress' } as unknown as Parameters<typeof controller.updateStatus>[1],
      req,
    );

    expect(workflow.changeStatus).toHaveBeenCalledWith({
      incidentId: 'inc-1',
      to: 'in_progress',
      actorId: 'operator-1',
      actorPermissions: ['UPDATE incidents'],
      closedReason: undefined,
    });
    expect(result).toEqual({ id: 'inc-1', status: 'in_progress' });
  });

  it('PATCH /:id/status propagates closed_reason to workflow.changeStatus when target is closed (sc-315 D4)', async () => {
    workflow.changeStatus.mockResolvedValue({ id: 'inc-2', status: 'closed' });
    const req = {
      user: {
        userId: 'admin-1',
        permissions: ['UPDATE incidents', 'CLOSE incidents'],
        scope: GLOBAL_SCOPE,
      },
    } as unknown as AuthenticatedRequest;

    await controller.updateStatus(
      'inc-2',
      { status: 'closed', closed_reason: 'duplicate' } as unknown as Parameters<typeof controller.updateStatus>[1],
      req,
    );

    expect(workflow.changeStatus).toHaveBeenCalledWith({
      incidentId: 'inc-2',
      to: 'closed',
      actorId: 'admin-1',
      actorPermissions: ['UPDATE incidents', 'CLOSE incidents'],
      closedReason: 'duplicate',
    });
  });
});
