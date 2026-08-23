import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSION_KEY = 'atl:require-permission';

export type PermissionAction =
  | 'READ'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'ASSIGN'
  // T5.1 — operator-driven claim/release workflow. The CHECK constraint on
  // permissions.action in migration 0019 extends the allowed set in lockstep
  // with this type; keep both in sync.
  | 'CLAIM'
  | 'RELEASE';

export interface RequiredPermission {
  action: PermissionAction;
  resource?: string;
}

/**
 * @RequirePermission('UPDATE', 'incidents') — per design D3.
 * If `resource` is omitted, PermissionGuard infers it from the first path
 * segment of the route (zero hardcoded resource maps).
 */
export const RequirePermission = (
  action: PermissionAction,
  resource?: string,
): MethodDecorator =>
  SetMetadata(REQUIRE_PERMISSION_KEY, { action, resource } as RequiredPermission);

/**
 * Formats a permission requirement as the canonical "ACTION resource"
 * string stored in the Redis permission set (e.g. "READ incidents").
 * Pure function — no side effects.
 */
export function formatPermissionString(action: PermissionAction, resource: string): string {
  return `${action} ${resource}`;
}

/**
 * Infers the resource name from a request path when not explicitly set on
 * the decorator, e.g. "/api/incidents/123" -> "incidents".
 * Pure function — no side effects.
 */
export function inferResourceFromPath(path: string): string {
  const segments = path.split('/').filter(Boolean);
  // ['api', 'incidents', '123'] -> 'incidents'
  const apiIndex = segments.indexOf('api');
  const resourceIndex = apiIndex >= 0 ? apiIndex + 1 : 0;
  return segments[resourceIndex] ?? '';
}
