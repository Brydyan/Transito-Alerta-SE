import { Incident, IncidentStatus } from '../../core/models/incident.model';

/**
 * F3 (sc-303) — F3.3.1 / D4.
 *
 * `availableActions()` is a pure function that maps (state, permissions,
 * currentUserId) → the list of action buttons the user can take on an
 * incident. Centralizing the rule here means:
 *
 *  - The same rule drives the detail page (F3.4.7) and any future
 *    re-render after a server action fails. No re-derivation in
 *    templates.
 *  - The matrix is testable as a function (F3.3.2) without mounting
 *    components or stubs.
 *  - The server is still the authority. If the backend returns 409
 *    for a transition this list claimed was valid, we reload — D4
 *    explicitly says: "ocultar un botón es ergonomía, no control".
 *
 * The actions are the user-facing verbs, not the wire transitions.
 * The same wire path (`PATCH /incidents/:id/status` with `to: 'closed'`)
 * can be reached from `close` (admin closes an unclaimable report) or
 * `resolve` (operator marks work done); the matrix picks which one to
 * show, not the wire shape.
 */

export type IncidentAction = 'claim' | 'release' | 'resolve' | 'close' | 'assign';

/**
 * Returns the set of actions the current user can take on this incident.
 *
 * @param incident  the incident as last loaded from the wire
 * @param permissions  the resolved permission set for the user
 *                     (e.g. ['UPDATE incidents', 'CLOSE incidents', …])
 * @param currentUserId  the authenticated user's id; used to decide
 *                        whether `claimed_by` matches (so `release`
 *                        only appears for the holder)
 */
export function availableActions(
  incident: Pick<
    Incident,
    'status' | 'claimed_by' | 'priority' | 'id'
  >,
  permissions: readonly string[],
  currentUserId: string,
): readonly IncidentAction[] {
  const out: IncidentAction[] = [];
  const status: IncidentStatus = incident.status;

  const hasUpdate = permissions.includes('UPDATE incidents');
  const hasClose = permissions.includes('CLOSE incidents');
  const hasAssign = permissions.includes('ASSIGN assignments');
  const hasClaim = permissions.includes('CLAIM incidents');
  const hasRelease = permissions.includes('RELEASE incidents');

  // `claim` is the `pending → in_progress` transition. The user needs
  // CLAIM incidents.
  if (hasClaim && status === 'pending' && incident.claimed_by === null) {
    out.push('claim');
  }

  // `release` is `in_progress → pending` semantically. The wire is
  // `POST /incidents/:id/release`; it requires the caller to be the
  // current claimer AND have RELEASE incidents permission.
  if (hasRelease && status === 'in_progress' && incident.claimed_by === currentUserId) {
    out.push('release');
  }

  // `resolve` is `in_progress → resolved`. The user must be the
  // claimer — operator-only flow. The wire is `PATCH /incidents/:id/status`
  // with `to: 'resolved'`, protected by `@RequirePermission('UPDATE')`.
  // Requires UPDATE incidents permission.
  if (hasUpdate && status === 'in_progress' && incident.claimed_by === currentUserId) {
    out.push('resolve');
  }

  // `close` is `* → closed`. The backend protects `PATCH /incidents/:id/status`
  // (which carries every transition, including close) with
  // `@RequirePermission('UPDATE')` as minimum, AND `IncidentWorkflowService.changeStatus()`
  // internally checks `actorPermissions.includes('CLOSE incidents')` when
  // `to === 'closed'`. So the button is reachable only when the user
  // has BOTH permissions.
  //
  // F3 (sc-303) W2 (ronda 5) — close requiere `UPDATE incidents` Y `CLOSE incidents`.
  // La implementación previa pedía `hasUpdate && hasClose`.
  if (
    hasUpdate &&
    hasClose &&
    (status === 'pending' || status === 'in_progress')
  ) {
    out.push('close');
  }

  // `assign` is the operator-reassignment flow (F3.4.8). Not a status
  // transition itself — it sets `claimed_by`. The permission is
  // `ASSIGN assignments`, decoupled from `UPDATE incidents` so an admin
  // without UPDATE can still route work. Always shown when the user
  // has the perm AND the incident is in a non-terminal status
  // (assigning to a closed incident would be a no-op).
  if (hasAssign && (status === 'pending' || status === 'in_progress')) {
    out.push('assign');
  }

  return out;
}
