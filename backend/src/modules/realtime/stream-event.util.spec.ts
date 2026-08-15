import { decodeStreamEntry } from './stream-event.util';

describe('decodeStreamEntry', () => {
  it('decodes a flat [type, ..., data, ...] field array into {type, data}', () => {
    const fields = ['type', 'incident.created', 'data', JSON.stringify({ id: 'inc-1', zone_id: 'z1' })];

    const result = decodeStreamEntry(fields);

    expect(result).toEqual({ type: 'incident.created', data: { id: 'inc-1', zone_id: 'z1' } });
  });

  it('returns null when type is missing', () => {
    expect(decodeStreamEntry(['data', '{}'])).toBeNull();
  });

  it('returns null when data is missing', () => {
    expect(decodeStreamEntry(['type', 'incident.created'])).toBeNull();
  });

  it('returns null when data is not valid JSON', () => {
    expect(decodeStreamEntry(['type', 'incident.created', 'data', 'not-json'])).toBeNull();
  });
});
