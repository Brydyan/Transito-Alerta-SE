# Admin Org Department Scoping Implementation

**Date:** 2026-10-18  
**Status:** Design & Context Document  
**Target:** Backend (NestJS + TypeORM)  
**Complexity:** Medium (7 coordinated changes)

---

## Executive Summary

`admin_org` users currently see ALL users in their organization. They should see ONLY users in their assigned department. This requires extending `AuthContext` to carry `departmentId` and adding a new scope kind `'department'` to the authorization layer.

**Key Facts:**
- `admin_org` users already have `department_id` populated in DB (persisted in `UsersService.adminCreate()`)
- No schema changes needed — column exists
- Only `admin_org` scope changes; `master` and `agent_system` remain unchanged

---

## Problem Statement

Currently:
```
admin_org user A (department 1) → GET /api/users → sees ALL users in org
admin_org user B (department 2) → GET /api/users → sees ALL users in org
master → GET /api/users → sees all users globally
```

Desired:
```
admin_org user A (department 1) → GET /api/users → sees ONLY users in dept 1
admin_org user B (department 2) → GET /api/users → sees ONLY users in dept 2
master → GET /api/users → unchanged (sees all)
agent_system → GET /api/users → unchanged (sees all)
```

---

## Implementation Plan

**Order matters — dependencies cascade:**

1. **Extend type system** (`subject-scope.ts`) — define new scope + extend AuthContext
2. **Extend DB query layer** (`auth-user.repository.ts`) — fetch `department_id` column
3. **Extend caching layer** (`auth-context.service.ts`) — pass through Redis
4. **Implement scope resolution** (`resolve-subject-scope.ts`) — new `admin_org` logic
5. **Implement filter handler** (`users.service.ts`) — apply scope in queries

---

## Detailed Changes

### Change 1: Extend Scope Types

**File:** `backend/src/shared/authz/subject-scope.ts`

**Location 1:** Lines 12-17 (SubjectScope type)

**Before:**
```typescript
export type SubjectScope =
  | { kind: 'global' }
  | { kind: 'org'; organizationId: string }
  | { kind: 'org_assigned'; organizationId: string; userId: string }
  | { kind: 'public' }
  | { kind: 'deny'; reason: 'staff_without_organization' };
```

**After:**
```typescript
export type SubjectScope =
  | { kind: 'global' }
  | { kind: 'org'; organizationId: string }
  | { kind: 'org_assigned'; organizationId: string; userId: string }
  | { kind: 'department'; organizationId: string; departmentId: string }  // ← ADD
  | { kind: 'public' }
  | { kind: 'deny'; reason: 'staff_without_organization' };
```

**Location 2:** Lines 24-44 (AuthContext interface)

**Before:**
```typescript
export interface AuthContext {
  userId: string;
  permissions: string[];
  organizationId: string | null;
  roleName: string | null;
  scope: SubjectScope;
  sessionId: string | null;
  isAnonymous: boolean;
}
```

**After:**
```typescript
export interface AuthContext {
  userId: string;
  permissions: string[];
  organizationId: string | null;
  departmentId: string | null;  // ← ADD
  roleName: string | null;
  scope: SubjectScope;
  sessionId: string | null;
  isAnonymous: boolean;
}
```

---

### Change 2: Extend DB Query Layer

**File:** `backend/src/modules/auth/auth-user.repository.ts`

**Location 1:** Lines 11-18 (AuthContextRow interface)

**Before:**
```typescript
export interface AuthContextRow {
  permissions: string[] | null;
  organization_id: string | null;
  device_uuid: string;
  role_name: string | null;
  role_deleted_at?: Date | null;
}
```

**After:**
```typescript
export interface AuthContextRow {
  permissions: string[] | null;
  organization_id: string | null;
  department_id: string | null;  // ← ADD
  device_uuid: string;
  role_name: string | null;
  role_deleted_at?: Date | null;
}
```

**Location 2:** Lines 73-89 (findAuthContextRow method)

**Before:**
```typescript
async findAuthContextRow(userId: string): Promise<AuthContextRow | null> {
  const rows: AuthContextRow[] = await this.dataSource.query(
    `SELECT u.permissions, u.organization_id, u.device_uuid, r.name AS role_name,
            r.deleted_at AS role_deleted_at
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1 AND u.deleted_at IS NULL AND u.is_active = TRUE`,
    [userId],
  );
  return rows[0] ?? null;
}
```

**After:**
```typescript
async findAuthContextRow(userId: string): Promise<AuthContextRow | null> {
  const rows: AuthContextRow[] = await this.dataSource.query(
    `SELECT u.permissions, u.organization_id, u.department_id, u.device_uuid,
            r.name AS role_name, r.deleted_at AS role_deleted_at
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1 AND u.deleted_at IS NULL AND u.is_active = TRUE`,
    [userId],
  );
  return rows[0] ?? null;
}
```

---

### Change 3: Extend Caching Layer

**File:** `backend/src/modules/auth/auth-context.service.ts`

**Location 1:** Lines 22-27 (CachedAuthContext interface)

**Before:**
```typescript
interface CachedAuthContext {
  permissions: string[];
  organizationId: string | null;
  roleName: string | null;
  isAnonymous: boolean;
}
```

**After:**
```typescript
interface CachedAuthContext {
  permissions: string[];
  organizationId: string | null;
  departmentId: string | null;  // ← ADD
  roleName: string | null;
  isAnonymous: boolean;
}
```

**Location 2:** Lines 129-140 (cache hit path)

**Before:**
```typescript
if (cached) {
  return {
    userId,
    permissions: cached.permissions,
    organizationId: cached.organizationId,
    roleName: cached.roleName,
    scope: resolveSubjectScope(cached.roleName, cached.organizationId, userId),
    sessionId: null,
    isAnonymous: cached.isAnonymous,
  };
}
```

**After:**
```typescript
if (cached) {
  return {
    userId,
    permissions: cached.permissions,
    organizationId: cached.organizationId,
    departmentId: cached.departmentId,  // ← ADD
    roleName: cached.roleName,
    scope: resolveSubjectScope(cached.roleName, cached.organizationId, cached.departmentId, userId),
    sessionId: null,
    isAnonymous: cached.isAnonymous,
  };
}
```

**Location 3:** Lines 144-157 (cache miss path)

**Before:**
```typescript
return {
  userId,
  permissions: [],
  organizationId: null,
  roleName: null,
  scope: resolveSubjectScope(null, null, userId),
  sessionId: null,
  isAnonymous: false,
};
```

**After:**
```typescript
return {
  userId,
  permissions: [],
  organizationId: null,
  departmentId: null,  // ← ADD
  roleName: null,
  scope: resolveSubjectScope(null, null, null, userId),
  sessionId: null,
  isAnonymous: false,
};
```

**Location 4:** Lines 159-186 (DB row processing & cache write)

**Before:**
```typescript
const isAnonymous = row.device_uuid === anonymousDeviceUuid;
const roleDeleted = row.role_deleted_at != null;
const permissions = isAnonymous
  ? anonymousPermissions
  : roleDeleted
    ? []
    : (row.permissions ?? []);
const organizationId = isAnonymous ? null : row.organization_id;
const roleName = isAnonymous || roleDeleted ? null : row.role_name;

await this.cache.set(
  key,
  { permissions, organizationId, roleName, isAnonymous },
  permissionCacheTtlSeconds * 1000,
);

return {
  userId,
  permissions,
  organizationId,
  roleName,
  scope: resolveSubjectScope(roleName, organizationId, userId),
  sessionId: null,
  isAnonymous,
};
```

**After:**
```typescript
const isAnonymous = row.device_uuid === anonymousDeviceUuid;
const roleDeleted = row.role_deleted_at != null;
const permissions = isAnonymous
  ? anonymousPermissions
  : roleDeleted
    ? []
    : (row.permissions ?? []);
const organizationId = isAnonymous ? null : row.organization_id;
const departmentId = isAnonymous ? null : row.department_id;  // ← ADD
const roleName = isAnonymous || roleDeleted ? null : row.role_name;

await this.cache.set(
  key,
  { permissions, organizationId, departmentId, roleName, isAnonymous },  // ← ADD departmentId
  permissionCacheTtlSeconds * 1000,
);

return {
  userId,
  permissions,
  organizationId,
  departmentId,  // ← ADD
  roleName,
  scope: resolveSubjectScope(roleName, organizationId, departmentId, userId),
  sessionId: null,
  isAnonymous,
};
```

---

### Change 4: Implement Scope Resolution

**File:** `backend/src/shared/authz/resolve-subject-scope.ts`

**Location:** Lines 11-32 (entire function)

**Before:**
```typescript
export function resolveSubjectScope(
  roleName: string | null,
  organizationId: string | null,
  userId?: string,
): SubjectScope {
  switch (roleName) {
    case 'master':
      return { kind: 'global' };
    case 'agent_system':
      return { kind: 'global' };
    case 'admin_org':
      return organizationId === null
        ? { kind: 'deny', reason: 'staff_without_organization' }
        : { kind: 'org', organizationId };
    case 'operator_org':
      return organizationId === null || userId === undefined
        ? { kind: 'deny', reason: 'staff_without_organization' }
        : { kind: 'org_assigned', organizationId, userId };
    default:
      return { kind: 'public' };
  }
}
```

**After:**
```typescript
export function resolveSubjectScope(
  roleName: string | null,
  organizationId: string | null,
  departmentId: string | null,  // ← ADD parameter
  userId?: string,
): SubjectScope {
  switch (roleName) {
    case 'master':
      return { kind: 'global' };
    case 'agent_system':
      return { kind: 'global' };
    case 'admin_org':
      // admin_org scoped to department (supervisor role)
      if (organizationId === null) {
        return { kind: 'deny', reason: 'staff_without_organization' };
      }
      if (departmentId === null) {
        // Fallback to org-level if no department (shouldn't happen in practice)
        return { kind: 'org', organizationId };
      }
      return { kind: 'department', organizationId, departmentId };  // ← NEW
    case 'operator_org':
      return organizationId === null || userId === undefined
        ? { kind: 'deny', reason: 'staff_without_organization' }
        : { kind: 'org_assigned', organizationId, userId };
    default:
      return { kind: 'public' };
  }
}
```

---

### Change 5: Implement Filter Handler

**File:** `backend/src/modules/users/users.service.ts`

**Location:** Lines 234-276 (list method, switch statement)

**Before:**
```typescript
switch (scope.kind) {
  case 'global':
    return this.findAndCount({ take, skip, where: isActiveWhere });
  case 'org':
  case 'org_assigned':
    return this.findAndCount({
      take,
      skip,
      where: { organizationId: scope.organizationId, ...isActiveWhere },
    });
  case 'public': {
    if (!callerId) {
      return { items: [], total: 0 };
    }
    const self = await this.userRepo.findOne({ where: { id: callerId } });
    return self ? { items: [self], total: 1 } : { items: [], total: 0 };
  }
  case 'deny':
    return { items: [], total: 0 };
}
```

**After:**
```typescript
switch (scope.kind) {
  case 'global':
    return this.findAndCount({ take, skip, where: isActiveWhere });
  case 'org':
  case 'org_assigned':
    return this.findAndCount({
      take,
      skip,
      where: { organizationId: scope.organizationId, ...isActiveWhere },
    });
  case 'department':  // ← ADD NEW CASE
    return this.findAndCount({
      take,
      skip,
      where: { departmentId: scope.departmentId, ...isActiveWhere },
    });
  case 'public': {
    if (!callerId) {
      return { items: [], total: 0 };
    }
    const self = await this.userRepo.findOne({ where: { id: callerId } });
    return self ? { items: [self], total: 1 } : { items: [], total: 0 };
  }
  case 'deny':
    return { items: [], total: 0 };
}
```

---

## Testing Checklist

### Unit Tests
- [ ] `resolve-subject-scope.spec.ts`: Add test for `admin_org` with departmentId → returns `{ kind: 'department' }`
- [ ] `resolve-subject-scope.spec.ts`: Test `admin_org` with null departmentId → falls back to org scope
- [ ] `auth-context.service.spec.ts`: Cache write includes `departmentId`
- [ ] `auth-context.service.spec.ts`: Cache read reconstructs departmentId correctly
- [ ] `users.service.spec.ts`: `list()` with `'department'` scope filters by `departmentId`

### Integration Tests (Manual in Staging)
1. Create two departments in same org
2. Create `admin_org` user in dept A, `admin_org` user in dept B
3. Login as admin_org (dept A) → `GET /api/users` → verify only dept A users returned
4. Login as admin_org (dept B) → `GET /api/users` → verify only dept B users returned
5. Login as master → `GET /api/users` → verify all users returned (unchanged)
6. Modify admin_org user's department (if implemented) → verify Redis cache invalidated

### Verification Commands

```bash
# Check Redis cache structure after login
redis-cli get "perm:v3:uid:{userId}"
# Should show: {"permissions":[...],"organizationId":"...","departmentId":"...","roleName":"admin_org","isAnonymous":false}

# Verify scope in request logs
# Controllers logging req.user.scope should show: { kind: 'department', organizationId: '...', departmentId: '...' }
```

---

## Deployment Notes

**Pre-deployment:**
- All 7 changes are coordinated — apply as a single commit
- No migrations needed (column exists in schema)
- No data changes needed

**Post-deployment:**
- Restart backend service
- Optional: Clear Redis cache (`FLUSHDB` in dev, or let 1h TTL expire in prod)
- Test with admin_org user immediately

**Rollback:**
- Revert all 7 changes
- Restart backend
- No data cleanup needed

---

## Known Limitations & Future Work

**Out of Scope (handle separately):**
- Geo-zone scoping (`geo_zone_id`)
- Department-level menu access (separate menu fix)
- Department reassignment endpoint (future feature)

**Future Extensions:**
- Once this works, add similar scoping for other resources (incidents, assignments, etc.)
- Parameterize scope resolution for other role types

---

## Files to Modify (Summary)

| # | File | Changes |
|---|------|---------|
| 1 | `backend/src/shared/authz/subject-scope.ts` | Add `'department'` scope + `departmentId` field |
| 2 | `backend/src/modules/auth/auth-user.repository.ts` | Extend `AuthContextRow`, update SQL SELECT |
| 3 | `backend/src/modules/auth/auth-context.service.ts` | Extend `CachedAuthContext`, pass through 4 locations |
| 4 | `backend/src/shared/authz/resolve-subject-scope.ts` | Add parameter, implement `admin_org` department case |
| 5 | `backend/src/modules/users/users.service.ts` | Add `'department'` case to switch statement |

**Total Changes:** 7 coordinated edits across 5 files  
**Estimated Impact:** Low (no schema, no data migration, isolated to auth layer + users service)
