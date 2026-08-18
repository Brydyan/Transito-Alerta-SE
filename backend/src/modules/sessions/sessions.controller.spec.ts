import { Reflector } from '@nestjs/core';

import { REQUIRE_PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

describe('SessionsController (T3.9 — no blanket @RequirePermission, self bypass lives in the service)', () => {
  let service: { revokeForActor: jest.Mock };
  let controller: SessionsController;

  beforeEach(() => {
    service = { revokeForActor: jest.fn() };
    controller = new SessionsController(service as unknown as SessionsService);
  });

  it('DELETE /:id carries no @RequirePermission metadata', () => {
    const reflector = new Reflector();
    const meta = reflector.get(REQUIRE_PERMISSION_KEY, controller.revoke);
    expect(meta).toBeUndefined();
  });

  it('DELETE /:id delegates to service.revokeForActor with the full actor + session id', async () => {
    service.revokeForActor.mockResolvedValue(undefined);
    const actor = { userId: 'u1', permissions: [], sessionId: 'sid-1', isAnonymous: false };
    const req = { user: actor } as unknown as AuthenticatedRequest;

    await controller.revoke('sid-1', req);

    expect(service.revokeForActor).toHaveBeenCalledWith(actor, 'sid-1');
  });
});
