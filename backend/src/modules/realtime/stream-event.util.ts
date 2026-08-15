export interface DecodedStreamEvent {
  type: string;
  data: Record<string, unknown>;
}

/**
 * Decodes a single Redis Streams entry — `[id, [field, value, field,
 * value, ...]]`, the shape ioredis returns from XREADGROUP — into a typed
 * domain event. Producers always write `type`/`data` fields (see
 * IncidentsService.publish); `data` is JSON-encoded on write, parsed here.
 * Pure function — no Redis I/O — so consumer-group wiring is testable in
 * isolation from a live stream.
 */
export function decodeStreamEntry(fields: string[]): DecodedStreamEvent | null {
  const map: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    map[fields[i]] = fields[i + 1];
  }

  if (!map.type || !map.data) {
    return null;
  }

  try {
    return { type: map.type, data: JSON.parse(map.data) };
  } catch {
    return null;
  }
}
