import { toSnakeCase, toSnakeCaseKeys } from './snake-case';

describe('toSnakeCase', () => {
  it('converts camelCase to snake_case', () => {
    expect(toSnakeCase('citizenId')).toBe('citizen_id');
    expect(toSnakeCase('geofenceMatched')).toBe('geofence_matched');
  });

  it('leaves an already snake_case key untouched (idempotent)', () => {
    expect(toSnakeCase('citizen_id')).toBe('citizen_id');
    expect(toSnakeCase(toSnakeCase('citizenId'))).toBe('citizen_id');
  });

  it('leaves single-word keys untouched', () => {
    expect(toSnakeCase('id')).toBe('id');
    expect(toSnakeCase('lat')).toBe('lat');
  });

  it('splits runs of capitals at the word boundary', () => {
    expect(toSnakeCase('deviceUUID')).toBe('device_uuid');
    expect(toSnakeCase('httpStatusCode')).toBe('http_status_code');
  });
});

describe('toSnakeCaseKeys', () => {
  it('converts keys of a flat object', () => {
    expect(toSnakeCaseKeys({ incidentId: 'i-1', userId: 'u-1' })).toEqual({
      incident_id: 'i-1',
      user_id: 'u-1',
    });
  });

  it('never rewrites values, only keys', () => {
    expect(toSnakeCaseKeys({ permissions: ['READ incidents', 'CREATE comments'] })).toEqual({
      permissions: ['READ incidents', 'CREATE comments'],
    });
  });

  it('recurses into nested objects and arrays', () => {
    expect(
      toSnakeCaseKeys({
        incidentId: 'i-1',
        comments: [{ userId: 'u-1', createdAt: 'now' }],
        meta: { pageSize: 20 },
      }),
    ).toEqual({
      incident_id: 'i-1',
      comments: [{ user_id: 'u-1', created_at: 'now' }],
      meta: { page_size: 20 },
    });
  });

  // A Date is an object; recursing into it would flatten it to {} and destroy
  // every timestamp in the API.
  it('passes Date values through untouched', () => {
    const createdAt = new Date('2026-08-15T16:30:17.435Z');

    const result = toSnakeCaseKeys({ createdAt }) as { created_at: Date };

    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.created_at.toISOString()).toBe('2026-08-15T16:30:17.435Z');
  });

  it('handles null, undefined and primitives without throwing', () => {
    expect(toSnakeCaseKeys(null)).toBeNull();
    expect(toSnakeCaseKeys(undefined)).toBeUndefined();
    expect(toSnakeCaseKeys('plain')).toBe('plain');
    expect(toSnakeCaseKeys(42)).toBe(42);
  });

  it('preserves null values inside objects', () => {
    expect(toSnakeCaseKeys({ assignedTo: null, zoneId: null })).toEqual({
      assigned_to: null,
      zone_id: null,
    });
  });

  it('is a no-op on a payload that is already snake_case', () => {
    const incident = {
      id: 'i-1',
      citizen_id: 'u-1',
      geofence_matched: false,
      lat: -2.2,
      lng: -80.5,
    };

    expect(toSnakeCaseKeys(incident)).toEqual(incident);
  });

  // TypeORM returns entity *instances*, not object literals. Treating "plain
  // object" as the only traversable shape silently skips every entity — which
  // is the exact payload this exists to convert.
  it('converts class instances, not just object literals', () => {
    class CommentEntity {
      id = 'c-1';
      incidentId = 'i-1';
      userId = 'u-1';
    }

    expect(toSnakeCaseKeys(new CommentEntity())).toEqual({
      id: 'c-1',
      incident_id: 'i-1',
      user_id: 'u-1',
    });
  });

  it('converts class instances nested inside arrays', () => {
    class CommentEntity {
      constructor(public incidentId: string) {}
    }

    expect(toSnakeCaseKeys([new CommentEntity('i-1')])).toEqual([{ incident_id: 'i-1' }]);
  });

  it('converts a top-level array of objects', () => {
    expect(toSnakeCaseKeys([{ incidentId: 'i-1' }, { incidentId: 'i-2' }])).toEqual([
      { incident_id: 'i-1' },
      { incident_id: 'i-2' },
    ]);
  });
});
