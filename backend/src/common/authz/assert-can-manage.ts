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

  assertVisible(actor, target);

  if (!(rankOf(actor.roleName) < rankOf(target.roleName))) {
    throw new ForbiddenException({
      code: 'INSUFFICIENT_ROLE_RANK',
      message: 'Actor does not outrank the target user',
    });
  }
}

/**
 * Visibility-only check (T3.9 design §8 D9 — "one new export, no new
 * axis"), promoted out of `assertCanManage` for `GET /users/:id/sessions`
 * and similar reads that need visibility WITHOUT the rank gate (D9 rank-
 * gates writes only). Zero behaviour change to `assertCanManage`, which now
 * delegates here — same `actor.roleName === null` D2 short-circuit is
 * preserved by each caller independently (harmless for sessions: 0016
 * grants `READ sessions` only through the two seeded admin roles).
 */
export function assertVisible(actor: AuthContext, target: ManageableTarget): void {
  if (!isVisibleUnderScope(actor, target)) {
    throw new NotFoundException('User not found');
  }
}

/**
 * Rank-checks the role being GRANTED, not the target's current role
 * (`assertCanManage` above answers a different question: "may I act on
 * this user at all?"). Without this, `assignRole` compared the actor
 * against the target's pre-grant role — a role-less target (`roleName:
 * null` -> `rankOf = MAX_SAFE_INTEGER`) always passed, so any actor
 * holding `ASSIGN roles` could hand a role-less user ANY role, including
 * one outranking the actor itself (security/assign-role-rank-gap).
 *
 * Strict `<`, same as `assertCanManage`: an actor can never grant its own
 * rank or higher, so peers cannot promote each other or a subordinate to
 * parity.
 *
 * D2 additivity preserved: `actor.roleName === null` short-circuits here
 * too, for the same reason as `assertCanManage` — every pre-T3.2 identity
 * has `role_id IS NULL`, and gating them would retroactively restrict
 * identities T3.2 promised to leave untouched.
 *
 * Call this AFTER `assertCanManage`, never before — visibility/rank on
 * the CURRENT target must be resolved first (404 before 403, D11) so an
 * actor who cannot even see the target does not learn anything about the
 * grant it attempted via a different exception.
 */
export function assertCanGrantRole(actor: AuthContext, grantedRoleName: string | null): void {
  if (actor.roleName === null) {
    return;
  }

  if (!(rankOf(actor.roleName) < rankOf(grantedRoleName))) {
    throw new ForbiddenException({
      code: 'INSUFFICIENT_ROLE_RANK',
      message: 'Actor does not outrank the granted role',
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
