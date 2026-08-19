import { ForbiddenException } from '@nestjs/common';

import { assertCanGrantRole } from './assert-can-manage';
import { AuthContext } from './subject-scope';
import { OUT_OF_SCOPE_ORGANIZATION } from '../../modules/invitations/invitation-errors';

/**
 * Invite-time authorization (T3.6 design D10). NOT `assertCanManage` — an
 * invitation targets an email with no `users` row yet, so there is no
 * target user to visibility-check. Mirrors `isVisibleUnderScope`'s
 * org/org_assigned/global cases for the ORGANIZATION being invited into,
 * then delegates to `assertCanGrantRole` for the rank check on the role
 * being granted.
 *
 * Org mismatch is `403 OUT_OF_SCOPE_ORGANIZATION`, deliberately NOT `404`
 * (design D10) — the actor supplied the `organization_id` itself in the
 * request body, so a 404 here would only confuse, unlike
 * `assertCanManage`'s 404-hides-existence rule for a target the actor did
 * not choose.
 */
export function assertCanInvite(
  actor: AuthContext,
  organizationId: string | null,
  invitedRoleName: string | null,
): void {
  if (actor.roleName === null) {
    return;
  }

  switch (actor.scope.kind) {
    case 'global':
      break;
    case 'org':
    case 'org_assigned':
      if (organizationId !== actor.scope.organizationId) {
        throw outOfScope();
      }
      break;
    case 'public':
    case 'deny':
      throw outOfScope();
  }

  assertCanGrantRole(actor, invitedRoleName);
}

function outOfScope(): ForbiddenException {
  return new ForbiddenException({
    code: OUT_OF_SCOPE_ORGANIZATION,
    message: 'Target organization is outside the actor scope',
  });
}
