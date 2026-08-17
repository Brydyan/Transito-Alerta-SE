import { AuthContext } from '../../common/authz/subject-scope';

export interface RealtimeEventPayload {
  zone_id?: string | null;
  zoneId?: string | null;
  org_id?: string | null;
  orgId?: string | null;
  organization_id?: string | null;
  id?: string;
  incident_id?: string | null;
  user_id?: string;
  userId?: string;
}

/**
 * Room naming (design D6) — multi-dimensional, gated at join. NEVER
 * role-based (the 25k-user failure mode: every admin gets every city-wide
 * incident). Rooms are computed from the EVENT PAYLOAD, not connection
 * state, so fan-out always matches the incident's actual zone/org.
 */
export const userRoom = (userId: string): string => `user:${userId}`;
export const zoneRoom = (zoneId: string): string => `geo:${zoneId}`;
export const orgRoom = (orgId: string): string => `org:${orgId}`;
export const incidentRoom = (incidentId: string): string => `incident:${incidentId}`;

/**
 * Resolves which rooms a domain event should be broadcast to, from the
 * event payload alone (design D6). Pure function — no socket/Redis I/O —
 * so the fan-out targeting logic is testable without a live gateway.
 */
export function resolveRoomsForEvent(payload: RealtimeEventPayload): string[] {
  const rooms: string[] = [];

  const zoneId = payload.zone_id ?? payload.zoneId;
  if (zoneId) {
    rooms.push(zoneRoom(zoneId));
  }

  const orgId = payload.org_id ?? payload.orgId ?? payload.organization_id;
  if (orgId) {
    rooms.push(orgRoom(orgId));
  }

  const incidentId = payload.incident_id ?? payload.id;
  if (incidentId) {
    rooms.push(incidentRoom(incidentId));
  }

  return rooms;
}

/**
 * Join-time authorization gate (design D6/D11 — T3.2 rewrite). Authorizes
 * the SPECIFIC requested room against the caller's `AuthContext.scope`,
 * not just a global "holds READ incidents" check — the T3.2 accident this
 * closes: any staff identity could previously join ANY `org:{id}`.
 *
 * `ownerOrgId` is pre-fetched by the caller (`RoomAuthorizer`, async PK
 * lookup) for `geo:`/`incident:` rooms — this function stays pure, no I/O.
 * Unknown namespace -> `false` (default-deny, as today).
 */
export function canJoinRoom(ctx: AuthContext, room: string, ownerOrgId?: string | null): boolean {
  if (room.startsWith('user:')) {
    const targetUserId = room.slice('user:'.length);
    return targetUserId === ctx.userId;
  }

  if (room.startsWith('org:')) {
    const targetOrgId = room.slice('org:'.length);
    switch (ctx.scope.kind) {
      case 'global':
        return true;
      case 'org':
      case 'org_assigned':
        return targetOrgId === ctx.scope.organizationId;
      case 'public':
      case 'deny':
        return false;
    }
  }

  if (room.startsWith('geo:') || room.startsWith('incident:')) {
    switch (ctx.scope.kind) {
      case 'global':
      case 'public':
        return true;
      case 'org':
      case 'org_assigned':
        return ownerOrgId === ctx.scope.organizationId;
      case 'deny':
        return false;
    }
  }

  return false;
}
