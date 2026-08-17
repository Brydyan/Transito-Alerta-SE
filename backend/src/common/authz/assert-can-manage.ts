import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { rankOf } from './role-rank';
import { AuthContext } from './subject-scope';

export interface ManageableTarget {
  id: string;
  organizationId: string | null;
  roleName: string | null;
}

/**
 * Service-level rank + visibility check (T3.2 design D9/D10/D11/D14). NOT
 * a guard decorator — the check needs the target row the service is
 * fetching anyway (precedent: CommentsService.delete's owner-only check).
 *
 * Order, per D10 — visibility THEN rank, never the other way:
 *   1. visible under `actor.scope`? no -> 404 (D11: a 403 would confirm
 *      the id exists and, by elimination, leak org membership).
 *   2. `rankOf(actor.roleName) < rankOf(target.roleName)`? no -> 403
 *      `INSUFFICIENT_ROLE_RANK` (the actor already sees this user in
 *      their own listing).
 *
 * Strict `<`: equal rank is blocked, so peers cannot act on each other or
 * self-demote.
 *
 * D2 additivity (found during e2e verification, not in the original
 * design): an actor with `roleName === null` holds none of the four
 * seeded staff roles — pre-T3.2, `PermissionGuard` alone gated
 * `assignRole`/`updateOrganization`, with zero rank/visibility check.
 * Gating such an actor here would retroactively restrict identities T3.2
 * promised to leave untouched (every pre-existing identity has `role_id
 * IS NULL`, D2) purely because they hold `ASSIGN`/`UPDATE` permissions
 * directly rather than through a seeded role. This check is additive: it
 * engages only once the ACTOR has been assigned one of the ranked roles.
 */
export function assertCanManage(actor: AuthContext, target: ManageableTarget): void {
  if (actor.roleName === null) {
    return;
  }

  if (!isVisibleUnderScope(actor, target)) {
    throw new NotFoundException('User not found');
  }

  if (!(rankOf(actor.roleName) < rankOf(target.roleName))) {
    throw new ForbiddenException({
      code: 'INSUFFICIENT_ROLE_RANK',
      message: 'Actor does not outrank the target user',
    });
  }
}

function isVisibleUnderScope(actor: AuthContext, target: ManageableTarget): boolean {
  switch (actor.scope.kind) {
    case 'global':
      return true;
    case 'org':
      return target.organizationId === actor.scope.organizationId;
    case 'org_assigned':
      // The user-visibility table scopes org_assigned the same as org for
      // users (design D3 table: org_assigned -> organization_id = $org).
      return target.organizationId === actor.scope.organizationId;
    case 'public':
      return target.id === actor.userId;
    case 'deny':
      return false;
  }
}
