/**
 * Key-casing helpers for the HTTP response boundary.
 *
 * Layer contract (see SnakeCaseResponseInterceptor):
 *   DB columns    snake_case  — SQL convention
 *   TS entities   camelCase   — TypeScript convention, via @Column({ name })
 *   HTTP JSON     snake_case  — API contract, applied here
 *
 * Incidents reaches HTTP through raw PostGIS SQL (rows are already
 * snake_case); every other module reaches it through TypeORM entities
 * (camelCase). These helpers are idempotent so both paths converge.
 */

/** Converts a single camelCase key to snake_case. Idempotent. */
export function toSnakeCase(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * Recursively rewrites object keys to snake_case, leaving values untouched.
 *
 * Traverses arrays, object literals AND class instances — TypeORM returns
 * entity instances, and those are precisely the payloads this exists to
 * convert, so restricting traversal to plain objects would skip the main
 * case.
 *
 * Value-like objects are returned by reference instead: recursing into a Date
 * would flatten it to `{}` and destroy every timestamp in the API.
 */
export function toSnakeCaseKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toSnakeCaseKeys);
  }

  if (value === null || typeof value !== 'object' || isValueObject(value)) {
    return value;
  }

  return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, val]) => {
    acc[toSnakeCase(key)] = toSnakeCaseKeys(val);
    return acc;
  }, {});
}

/**
 * Objects that carry a value rather than a set of fields. Traversing these
 * would destroy them, so they pass through by reference and serialize on
 * their own terms.
 */
function isValueObject(value: object): boolean {
  return (
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof Map ||
    value instanceof Set ||
    Buffer.isBuffer(value)
  );
}
