import { canJoinRoom, incidentRoom, orgRoom, resolveRoomsForEvent, userRoom, zoneRoom } from './room.util';

describe('room naming (design D6)', () => {
  it('builds geo:{zone_id}, org:{org_id}, incident:{id}, user:{id} — never role-based', () => {
    expect(zoneRoom('zone-1')).toBe('geo:zone-1');
    expect(orgRoom('org-1')).toBe('org:org-1');
    expect(incidentRoom('inc-1')).toBe('incident:inc-1');
    expect(userRoom('user-1')).toBe('user:user-1');
  });
});

describe('resolveRoomsForEvent', () => {
  it('resolves zone + org + incident rooms from an incident.created-shaped payload', () => {
    const rooms = resolveRoomsForEvent({ zone_id: 'zone-1', org_id: 'org-1', id: 'inc-1' });
    expect(rooms).toEqual(['geo:zone-1', 'org:org-1', 'incident:inc-1']);
  });

  it('omits a dimension entirely when absent (e.g. geofence_matched=false -> no zone room)', () => {
    const rooms = resolveRoomsForEvent({ zone_id: null, id: 'inc-1' });
    expect(rooms).toEqual(['incident:inc-1']);
  });

  it('accepts camelCase field names too (assignment/comment payload shapes)', () => {
    const rooms = resolveRoomsForEvent({ zoneId: 'zone-2', incident_id: 'inc-2' });
    expect(rooms).toEqual(['geo:zone-2', 'incident:inc-2']);
  });

  it('returns an empty array when the payload carries no dimension keys', () => {
    expect(resolveRoomsForEvent({})).toEqual([]);
  });
});

describe('canJoinRoom (join-time authorization gate)', () => {
  it('allows a socket holding "READ incidents" to join', () => {
    expect(canJoinRoom(['READ incidents'])).toBe(true);
  });

  it('denies a socket without READ incidents (default-deny, R7)', () => {
    expect(canJoinRoom(['CREATE incidents'])).toBe(false);
  });

  it('denies an empty permission set', () => {
    expect(canJoinRoom([])).toBe(false);
  });
});
