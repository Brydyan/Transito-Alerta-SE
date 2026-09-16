# Specification: Departments Module (CRUD + Scoping)

**Change**: `2026-09-15-departments-module`  
**Capability**: Department management with organizational scoping  
**In Scope**: CRUD endpoints, permission validation, soft delete, list filtering

---

## R1: Create Department

**Requirement**: An `admin_organizacion` user can create a new department under their organization.

### S1.1 — Create dept within own organization

**Given** a user with role `admin_organizacion` and `organization_id = "org-1"`  
**When** `POST /api/departments` with `{ name: "Traffic", organization_id: "org-1" }`  
**Then** the dept is created with a UUID, `created_at`, and `deleted_at = NULL`  
**And** the response includes `{ id, name, organization_id, created_at, updated_at, deleted_at }`

### S1.2 — Create dept in wrong org (unauthorized)

**Given** a user with role `admin_organizacion` and `organization_id = "org-1"`  
**When** `POST /api/departments` with `organization_id = "org-2"` (different org)  
**Then** the request returns `403 Forbidden` and no dept is created

### S1.3 — Create dept with duplicate name in same org

**Given** a dept "Traffic" already exists under org-1  
**When** `POST /api/departments` with `{ name: "Traffic", organization_id: "org-1" }`  
**Then** the request returns `400 Bad Request` (UNIQUE(org_id, name) violation)  
**And** no duplicate dept is created

### S1.4 — Create dept with master or admin_sistema role (global)

**Given** a user with role `master` or `admin_sistema`  
**When** `POST /api/departments` with any valid `organization_id`  
**Then** the dept is created under that org regardless of user's own `organization_id`

---

## R2: Read Department

**Requirement**: Users can list and fetch departments filtered by their authorization scope.

### S2.1 — List depts of own organization (admin_org scope)

**Given** a user with role `admin_organizacion` and `organization_id = "org-1"`  
**When** `GET /api/departments?organization_id=org-1` (implicit from scope)  
**Then** the response includes only depts where `organization_id = "org-1"` and `deleted_at IS NULL`  
**And** pagination info: `{ items: [...], total: N, page: 1, per_page: 100 }`

### S2.2 — List all depts globally (master scope)

**Given** a user with role `master`  
**When** `GET /api/departments` (no filter)  
**Then** the response includes all non-deleted depts from all orgs

### S2.3 — Get single dept by ID (authorized)

**Given** a dept "Traffic" with `id = "dept-123"` under `organization_id = "org-1"`  
**And** a user with role `admin_organizacion` and `organization_id = "org-1"`  
**When** `GET /api/departments/dept-123`  
**Then** the response includes the dept details (name, description, organization_id, timestamps)

### S2.4 — Get dept from another org (unauthorized)

**Given** a user with role `admin_organizacion` and `organization_id = "org-1"`  
**When** `GET /api/departments/dept-999` (dept under org-2)  
**Then** the request returns `403 Forbidden`

### S2.5 — Get deleted dept (soft delete, hidden by default)

**Given** a dept with `deleted_at = <timestamp>` (soft-deleted)  
**When** `GET /api/departments` or `GET /api/departments/:id`  
**Then** the deleted dept is NOT included in results  
**And** a separate e2e scenario verifies deleted depts can be returned with `include_deleted=true` query param (optional admin feature)

---

## R3: Update Department

**Requirement**: An `admin_organizacion` can update dept details (name, description) within their org.

### S3.1 — Update dept name

**Given** a dept "Traffic" with `id = "dept-123"` under org-1  
**And** a user with role `admin_organizacion` and `organization_id = "org-1"`  
**When** `PATCH /api/departments/dept-123` with `{ name: "Traffic & Parking" }`  
**Then** the dept name is updated  
**And** `updated_at` is refreshed to current timestamp  
**And** `deleted_at` remains NULL

### S3.2 — Cannot move dept to another org

**Given** a user with role `admin_organizacion`  
**When** `PATCH /api/departments/dept-123` with `{ organization_id: "org-2" }`  
**Then** the request returns `400 Bad Request` (organization_id is immutable)  
**Or** the field is silently ignored (design choice D4)

### S3.3 — Update without permission returns 403

**Given** a user with role `operador_organizacion` (no UPDATE perm)  
**When** `PATCH /api/departments/dept-123`  
**Then** the request returns `403 Forbidden`

---

## R4: Delete Department (Soft Delete)

**Requirement**: An `admin_organizacion` can soft-delete a dept; incidents lose dept assignment but remain.

### S4.1 — Soft-delete dept

**Given** a dept with `id = "dept-123"` and `deleted_at = NULL`  
**And** incidents assigned to that dept  
**When** `DELETE /api/departments/dept-123` (from admin_organizacion)  
**Then** the dept's `deleted_at` is set to current timestamp  
**And** incidents with `department_id = "dept-123"` are NOT deleted; instead `department_id` is set to NULL (ON DELETE SET NULL FK behavior or service logic)  
**And** the response returns `204 No Content`

### S4.2 — Soft-deleted dept excluded from list

**Given** a dept soft-deleted 1 hour ago  
**When** `GET /api/departments`  
**Then** the deleted dept is NOT in the result list

### S4.3 — Cannot delete dept of another org

**Given** a user with `admin_organizacion` and `organization_id = "org-1"`  
**When** `DELETE /api/departments/dept-999` (under org-2)  
**Then** the request returns `403 Forbidden`

---

## R5: Department Scoping on Incidents

**Requirement**: Users see only incidents from their assigned department.

### S5.1 — User with dept filters to that dept

**Given** a user assigned to `department_id = "dept-123"` (under org-1)  
**And** 10 incidents under org-1: 6 with `department_id = "dept-123"`, 4 with `department_id = NULL`  
**When** `GET /api/incidents` (with default filters)  
**Then** depending on auth level:
  - **operador_org**: sees only the 6 depts + 4 org-wide (or only 6 if strict dept scope)
  - **admin_org**: sees all 10
  - **master**: sees all (global)

### S5.2 — Incident dept_id is preserved on incident update

**Given** an incident with `department_id = "dept-123"`  
**When** `PATCH /api/incidents/:id` with `{ title: "Updated" }` (not touching dept_id)  
**Then** the incident's `department_id` remains "dept-123"

### S5.3 — Assign incident to dept on creation

**Given** a user with role `operador_organizacion` and `department_id = "dept-123"`  
**When** `POST /api/incidents` with `{ title, description, location }`  
**Then** the created incident automatically has `department_id = user.department_id` (auto-scoping)  
**Or** the user may explicitly set it if they have permission (design choice)

---

## R6: Permission Validation

**Requirement**: Permission guards prevent unauthorized dept operations.

### S6.1 — Unauthenticated request returns 401

**Given** no JWT token  
**When** `GET /api/departments`  
**Then** the request returns `401 Unauthorized`

### S6.2 — Role without dept READ perm returns 403

**Given** a user with role `reporter` (no `READ departments` perm)  
**When** `GET /api/departments`  
**Then** the request returns `403 Forbidden`

### S6.3 — Permission cache invalidation on role change

**Given** a user with role `operador_organizacion` (no dept CREATE)  
**And** their role is changed to `admin_organizacion` (gains CREATE)  
**When** their session is refreshed / new token issued  
**Then** the new token has updated permissions  
**And** `POST /api/departments` succeeds (within this new session)

---

## R7: List Filtering & Pagination

**Requirement**: Dept list endpoint supports pagination, search, and filters.

### S7.1 — Paginate departments

**Given** 250 departments across all orgs  
**When** `GET /api/departments?page=2&per_page=100`  
**Then** the response includes `items: [100 depts from page 2]` and `total: 250`

### S7.2 — Search depts by name

**Given** depts: "Traffic", "Infrastructure", "Waste", "Traffic Accidents"  
**When** `GET /api/departments?search=traffic`  
**Then** the response includes "Traffic" and "Traffic Accidents" (case-insensitive partial match)

### S7.3 — Filter by organization_id (explicit)

**Given** a master user querying depts  
**When** `GET /api/departments?organization_id=org-123`  
**Then** the response includes only depts under org-123

---

## R8: Soft Delete & Rollback Scenarios

**Requirement**: Soft delete is reversible; deleted depts don't break referential integrity.

### S8.1 — Incidents reference deleted dept safely

**Given** incidents with `department_id = "dept-123"` (soft-deleted)  
**When** querying those incidents  
**Then** the `department_id` is still "dept-123" (not NULL yet)  
**And** the dept object in the incident detail response is `null` (LEFT JOIN skips deleted row)  
**Or** returns a `{ id, name: "[deleted]" }` marker (design choice)

### S8.2 — Re-enable (undelete) a dept

**Given** a soft-deleted dept  
**When** `PATCH /api/departments/:id` with `{ deleted_at: null }` (admin-only recovery)  
**Then** the dept is restored (deleted_at set to NULL)  
**And** existing incident references work again

---

## Edge Cases & Constraints

- **Null organization_id on user**: User has no dept assignment → sees only org-wide (dept_id = NULL) incidents
- **Null department_id on incident**: Incident visible to all users of that org (org-wide scope)
- **Cascading delete of organization**: Departments are CASCADE deleted (0056 migration FK), incidents set dept_id = NULL
- **Unique constraint**: `UNIQUE(organization_id, name)` enforced at DB level
- **Soft delete index**: Queries default to `WHERE deleted_at IS NULL` for performance
