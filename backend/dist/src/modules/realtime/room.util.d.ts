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
export declare const userRoom: (userId: string) => string;
export declare const zoneRoom: (zoneId: string) => string;
export declare const orgRoom: (orgId: string) => string;
export declare const incidentRoom: (incidentId: string) => string;
export declare function resolveRoomsForEvent(payload: RealtimeEventPayload): string[];
export declare function canJoinRoom(ctx: AuthContext, room: string, ownerOrgId?: string | null): boolean;
