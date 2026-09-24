"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.incidentRoom = exports.orgRoom = exports.zoneRoom = exports.userRoom = void 0;
exports.resolveRoomsForEvent = resolveRoomsForEvent;
exports.canJoinRoom = canJoinRoom;
const userRoom = (userId) => `user:${userId}`;
exports.userRoom = userRoom;
const zoneRoom = (zoneId) => `geo:${zoneId}`;
exports.zoneRoom = zoneRoom;
const orgRoom = (orgId) => `org:${orgId}`;
exports.orgRoom = orgRoom;
const incidentRoom = (incidentId) => `incident:${incidentId}`;
exports.incidentRoom = incidentRoom;
function resolveRoomsForEvent(payload) {
    const rooms = [];
    const zoneId = payload.zone_id ?? payload.zoneId;
    if (zoneId) {
        rooms.push((0, exports.zoneRoom)(zoneId));
    }
    const orgId = payload.org_id ?? payload.orgId ?? payload.organization_id;
    if (orgId) {
        rooms.push((0, exports.orgRoom)(orgId));
    }
    const incidentId = payload.incident_id ?? payload.id;
    if (incidentId) {
        rooms.push((0, exports.incidentRoom)(incidentId));
    }
    return rooms;
}
function canJoinRoom(ctx, room, ownerOrgId) {
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
//# sourceMappingURL=room.util.js.map