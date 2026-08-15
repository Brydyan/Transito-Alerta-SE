import { hasPermission } from '../../common/guards/permission.guard';

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
 * Join-time authorization gate (design D6: "authorization becomes a
 * join-time check, not a per-message filter"). A socket may join a
 * geo:{zone_id}/org:{org_id}/incident:{id} room only if its permission set
 * grants READ on incidents; user:{id} rooms require no extra check beyond
 * being authenticated as that user (checked by the caller).
 */
export function canJoinRoom(permissions: string[]): boolean {
  return hasPermission(permissions, 'READ', 'incidents');
}
