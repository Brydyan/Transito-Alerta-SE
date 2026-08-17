import { Reflector } from '@nestjs/core';

import { REQUIRE_PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { SubjectScope } from '../../common/authz/subject-scope';
import { StatusHistoryController } from './status-history.controller';
import { StatusHistoryService } from './status-history.service';

describe('StatusHistoryController', () => {
  it('carries an explicit READ status-history permission override (guards D1 regression)', () => {
    const reflector = new Reflector();

    const metadata = reflector.get(
      REQUIRE_PERMISSION_KEY,
      StatusHistoryController.prototype.list,
    );

    expect(metadata).toEqual({ action: 'READ', resource: 'status-history' });
  });

  it('forwards req.user.scope to StatusHistoryService.findByIncident (regression guard — this wire was missing)', async () => {
    const service = { findByIncident: jest.fn().mockResolvedValue({ items: [], total: 0 }) };
    const controller = new StatusHistoryController(service as unknown as StatusHistoryService);

    const scope: SubjectScope = { kind: 'org', organizationId: 'org-1' };
    const req = { user: { userId: 'u1', permissions: [], organizationId: 'org-1', roleName: 'admin_organizacion', scope } } as unknown as AuthenticatedRequest;

    const result = await controller.list('incident-1', req);

    expect(service.findByIncident).toHaveBeenCalledWith('incident-1', scope);
    expect(result).toEqual({ items: [], total: 0 });
  });
});
