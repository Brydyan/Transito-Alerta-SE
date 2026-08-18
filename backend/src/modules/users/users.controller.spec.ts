import { Reflector } from '@nestjs/core';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UploadedFile } from './avatar-storage.service';
import { REQUIRE_PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';

const GLOBAL_SCOPE = { kind: 'global' as const };

describe('UsersController', () => {
  let service: {
    findById: jest.Mock;
    updateProfile: jest.Mock;
    updateAvatar: jest.Mock;
    list: jest.Mock;
    updateOrganization: jest.Mock;
    getSessionsForSelf: jest.Mock;
    getSessionsForUser: jest.Mock;
  };
  let controller: UsersController;

  beforeEach(() => {
    service = {
      findById: jest.fn(),
      updateProfile: jest.fn(),
      updateAvatar: jest.fn(),
      list: jest.fn(),
      updateOrganization: jest.fn(),
      getSessionsForSelf: jest.fn(),
      getSessionsForUser: jest.fn(),
    };
    controller = new UsersController(service as unknown as UsersService);
  });

  it('GET / (list) requires READ users', () => {
    const reflector = new Reflector();
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.list);
    expect(meta).toEqual({ action: 'READ', resource: undefined });
  });

  it('GET /me delegates to service.findById with the authenticated user id', async () => {
    service.findById.mockResolvedValue({ id: 'u1' });
    const req = { user: { userId: 'u1', permissions: [], scope: GLOBAL_SCOPE } } as unknown as AuthenticatedRequest;

    const result = await controller.me(req);

    expect(service.findById).toHaveBeenCalledWith('u1');
    expect(result).toEqual({ id: 'u1' });
  });

  it('PATCH /me delegates to service.updateProfile', async () => {
    service.updateProfile.mockResolvedValue({ id: 'u1', firstName: 'Ana' });
    const req = { user: { userId: 'u1', permissions: [], scope: GLOBAL_SCOPE } } as unknown as AuthenticatedRequest;

    const result = await controller.updateProfile({ first_name: 'Ana' } as unknown as Parameters<typeof controller.updateProfile>[0], req);

    expect(service.updateProfile).toHaveBeenCalledWith('u1', { firstName: 'Ana', lastName: undefined });
    expect(result).toEqual({ id: 'u1', firstName: 'Ana' });
  });

  it('POST /me/avatar delegates to service.updateAvatar with the uploaded file', async () => {
    service.updateAvatar.mockResolvedValue({ id: 'u1', avatarUrl: 'https://x' });
    const req = { user: { userId: 'u1', permissions: [], scope: GLOBAL_SCOPE } } as unknown as AuthenticatedRequest;
    const file = { buffer: Buffer.from('x'), mimetype: 'image/png', originalname: 'a.png' } as unknown as UploadedFile;

    const result = await controller.updateAvatar(file, req);

    expect(service.updateAvatar).toHaveBeenCalledWith('u1', file);
    expect(result).toEqual({ id: 'u1', avatarUrl: 'https://x' });
  });

  it('GET / delegates to service.list with pagination query params and the caller scope', async () => {
    service.list.mockResolvedValue({ items: [], total: 0 });
    const req = {
      user: { userId: 'u1', permissions: [], scope: GLOBAL_SCOPE },
    } as unknown as AuthenticatedRequest;

    await controller.list(req, '2', '50');

    expect(service.list).toHaveBeenCalledWith(2, 50, GLOBAL_SCOPE, 'u1');
  });

  it('PATCH /:id/organization requires UPDATE users', () => {
    const reflector = new Reflector();
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.updateOrganization);
    expect(meta).toEqual({ action: 'UPDATE', resource: undefined });
  });

  it('PATCH /:id/organization delegates to service.updateOrganization with the full actor context', async () => {
    service.updateOrganization.mockResolvedValue({ id: 'target-1', organizationId: 'org-A' });
    const actor = { userId: 'admin-1', permissions: [], scope: GLOBAL_SCOPE };
    const req = { user: actor } as unknown as AuthenticatedRequest;

    const result = await controller.updateOrganization(
      'target-1',
      { organization_id: 'org-A' },
      req,
    );

    expect(service.updateOrganization).toHaveBeenCalledWith(actor, 'target-1', 'org-A');
    expect(result).toEqual({ id: 'target-1', organizationId: 'org-A' });
  });

  describe('T3.9 — session listing routes', () => {
    it('GET /me/sessions delegates to service.getSessionsForSelf with the full actor (no @RequirePermission — self bypass)', async () => {
      const reflector = new Reflector();
      const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.meSessions);
      expect(meta).toBeUndefined();

      service.getSessionsForSelf.mockResolvedValue([]);
      const actor = { userId: 'u1', permissions: [], scope: GLOBAL_SCOPE, sessionId: 's1', isAnonymous: false };
      const req = { user: actor } as unknown as AuthenticatedRequest;

      const result = await controller.meSessions(req);

      expect(service.getSessionsForSelf).toHaveBeenCalledWith(actor);
      expect(result).toEqual([]);
    });

    it('GET /:id/sessions requires READ sessions', () => {
      const reflector = new Reflector();
      const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.userSessions);
      expect(meta).toEqual({ action: 'READ', resource: 'sessions' });
    });

    it('GET /:id/sessions delegates to service.getSessionsForUser with the actor and target id', async () => {
      service.getSessionsForUser.mockResolvedValue([]);
      const actor = { userId: 'admin-1', permissions: ['READ sessions'], scope: GLOBAL_SCOPE };
      const req = { user: actor } as unknown as AuthenticatedRequest;

      const result = await controller.userSessions('target-1', req);

      expect(service.getSessionsForUser).toHaveBeenCalledWith(actor, 'target-1');
      expect(result).toEqual([]);
    });
  });
});
