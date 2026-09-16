# Design: Departments Module

**Change**: `2026-09-15-departments-module`  
**Phase**: Backend implementation (NestJS CRUD)

---

## D1: Department as Optional Organizational Subdivision

**Decision**: Departments are **optional** per organization. Users and incidents can exist without department assignment.

**Rationale**:
- Enables gradual rollout: orgs can adopt depts without migration disruption
- Null department_id = "org-wide" (baseline scope before dept adoption)
- Backfill: all existing users/incidents have dept_id = NULL initially

**Rejected Alternative**: Mandatory departments (every org must have ≥1 dept)
- **Why rejected**: Would require backfill strategy (create default "General" dept per org), adds complexity, breaks existing auth flows temporarily, locks smaller orgs into dept model they don't need

**TypeORM Entity**:
```typescript
@Entity('departments')
export class DepartmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string | null;

  @Column()
  organization_id: string; // FK, NOT NULL — each dept belongs to exactly one org

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date | null;

  @Unique(['organization_id', 'name'])
  // UNIQUE constraint: dept names are unique within org
}
```

---

## D2: Scoping Rules — Who Sees What

**Decision**: Use layered authorization:
- Users with **no dept assignment** see incidents with `dept_id = NULL` (org-wide)
- Users with **dept assignment** see incidents from their dept + org-wide incidents
- **admin_org** and above: see all incidents in their org regardless of dept

**Rationale**:
- Mirrors existing org scoping (0015_organizations_scoping.sql)
- Gradual adoption: teams can migrate to depts without excluding org-wide incidents
- Incident visibility = `(incident.dept_id = user.dept_id) OR (incident.dept_id IS NULL) OR (user.role >= admin_org)`

**Rejected Alternative 1**: Strict dept silos (users only see their dept)
- **Why rejected**: Breaks org-wide workflows (e.g., master ticket seen by all), too rigid for hybrid orgs

**Rejected Alternative 2**: Department required (no NULL dept_id)
- **Why rejected**: See D1 above; breaks backcompat

**Query Pattern in Repository**:
```typescript
// Find incidents visible to user
async findVisibleToUser(userId: string): Promise<Incident[]> {
  const user = await this.userRepo.findOne({ where: { id: userId } });
  const query = this.repo.createQueryBuilder('i')
    .where('i.organization_id = :org_id', { org_id: user.organization_id });
  
  // If user has dept, see their dept + org-wide; else see only org-wide
  if (user.department_id) {
    query.andWhere('(i.department_id = :dept_id OR i.department_id IS NULL)', 
      { dept_id: user.department_id });
  } else {
    query.andWhere('i.department_id IS NULL');
  }
  
  return query.getMany();
}
```

---

## D3: Soft Delete (Following Established Pattern)

**Decision**: Soft delete on `departments` via `deleted_at` column (matches pattern from 0025_incidents_soft_delete.sql).

**Rationale**:
- Consistent with existing soft-delete pattern in incidents, users, roles
- Preserves audit trail (deleted_at timestamp)
- FK `ON DELETE SET NULL` on users/incidents keeps data referential integrity

**Rollback Behavior**:
- When dept is soft-deleted, `deleted_at` is set
- Incidents with that dept_id become orphaned (still reference the dept)
- Service layer should handle: either hide incidents with deleted depts OR set incident.dept_id = NULL on dept deletion

**Chosen Approach**: On deletion, incident.dept_id is automatically set to NULL (via service call or DB trigger)
```typescript
// In DepartmentsService.delete()
async delete(id: string): Promise<void> {
  // 1. Set dept.deleted_at
  await this.repo.softRemove(dept);
  
  // 2. Orphan incidents: set their dept_id to NULL
  await this.incidentsRepo.update(
    { department_id: id },
    { department_id: null }
  );
}
```

**Rejected Alternative**: Hard delete
- **Why rejected**: Breaks audit trail, orphans incidents without warning

---

## D4: Department Name Immutability vs. Mutable

**Decision**: `organization_id` is **immutable**; name/description are **mutable**.

**Rationale**:
- Moving a dept between orgs is rare and dangerous (breaks scoping)
- Name/description are cosmetic; safe to update
- Incident references remain valid

**Rejected Alternative**: Allow organization_id change on PATCH
- **Why rejected**: Could break auth checks mid-request, requires audit logging, complex to undo

**Controller Validation**:
```typescript
async update(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: UpdateDepartmentDto, // omits organization_id
): Promise<DepartmentEntity> {
  // organization_id is never accepted from client
  return this.service.update(id, {
    name: dto.name,
    description: dto.description,
  });
}
```

---

## D5: Department-Incident Auto-Scoping on Creation

**Decision**: When a user with `department_id = "dept-123"` creates an incident, the incident automatically gets `department_id = "dept-123"`.

**Rationale**:
- Reduces user error (users won't forget to assign dept)
- Matches existing pattern for organization_id (auto-assigned from user.organization_id)

**Rejected Alternative**: User must explicitly set dept_id on incident creation
- **Why rejected**: Forgetting to set dept_id leads to incidents in wrong scope, visibility issues

**Implementation**:
```typescript
// In IncidentsService.create()
async create(createDto: CreateIncidentDto, user: UserEntity): Promise<IncidentEntity> {
  const incident = new IncidentEntity();
  incident.title = createDto.title;
  incident.organization_id = user.organization_id;
  incident.department_id = user.department_id || null; // Auto-scope
  incident.citizen_id = user.id;
  return this.repo.save(incident);
}
```

---

## D6: Permission Scoping in Controller vs. Service

**Decision**: Authorization checks happen at **controller** level (via `@RequirePermission` decorator + `PermissionGuard`); **service layer assumes valid caller**.

**Rationale**:
- Matches existing pattern in all other controllers (incidents, users, roles, organizations)
- Cleaner separation: controller guards, service executes
- Reduces double-validation

**Scoping Example** (controller):
```typescript
@Patch(':id')
@RequirePermission('UPDATE', 'departments')
async update(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: UpdateDepartmentDto,
  @CurrentUser() user: UserEntity,
): Promise<DepartmentEntity> {
  // Service assumes caller is authorized
  const dept = await this.service.findById(id);
  
  // Controller adds org check (if not master/admin_sistema)
  if (!['master', 'admin_sistema'].includes(user.role.name)) {
    if (dept.organization_id !== user.organization_id) {
      throw new ForbiddenException('Not your org');
    }
  }
  
  return this.service.update(id, dto);
}
```

---

## D7: List Endpoint Pagination

**Decision**: Use cursor-less offset pagination (page + per_page), max 100 items per page.

**Rationale**:
- Matches existing pagination in organizations, incidents, etc.
- Familiar to frontend team
- Sufficient for typical dept lists (10-100 depts per org)

**Endpoint**:
```
GET /api/departments?page=1&per_page=50&organization_id=org-123&search=traffic
```

**Response Shape**:
```json
{
  "items": [
    { "id": "...", "name": "Traffic", "organization_id": "org-123", ... }
  ],
  "total": 47,
  "page": 1,
  "per_page": 50
}
```

**Rejected Alternative**: Cursor pagination (keyset)
- **Why rejected**: Not needed for small lists, adds complexity

---

## D8: Indexes for Performance

**Decision**: Create targeted indexes:
1. `idx_departments_org_deleted`: query depts by org (common list operation)
2. `idx_users_department`: filter incidents by user's dept
3. `idx_incidents_department`: find incidents in a dept

**Migration**:
```sql
CREATE INDEX idx_departments_org_deleted 
  ON departments(organization_id, deleted_at);
CREATE INDEX idx_users_department 
  ON users(department_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_incidents_department 
  ON incidents(department_id) WHERE deleted_at IS NULL;
```

**Rationale**: WHERE clauses speed up soft-delete filtering; covering indexes (org_id, deleted_at) avoid table scans

---

## D9: DTOs & Response Shape

**Incoming DTOs**:
```typescript
export class CreateDepartmentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsUUID()
  organization_id: string;
}

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;
  // Note: organization_id is never accepted
}
```

**Response DTO** (matches entity shape):
```typescript
export class DepartmentDto {
  id: string;
  name: string;
  description: string | null;
  organization_id: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}
```

**Interceptor**: Global `SnakeCaseResponseInterceptor` (existing) converts camelCase to snake_case on wire

---

## D10: Testing Strategy

**Unit Tests** (DepartmentsService):
- CRUD happy paths
- Soft delete + orphaning logic
- Filtering by org
- Null department_id handling
- ~30 test cases

**Integration Tests** (DepartmentsController + Repository):
- Full CRUD via HTTP
- Permission guards (403 on cross-org, unauthorized role)
- Pagination + search
- Soft delete visibility
- Incident orphaning on dept deletion
- ~25 test cases

**E2E Tests** (full workflow):
- Create org → create dept → assign user → create incident → verify scoping
- ~10 workflow scenarios

**Coverage**: Target ≥90% on service/repo, ≥75% on controller

---

## D11: No Caching Layer (V1)

**Decision**: No Redis caching for dept list. Direct DB queries.

**Rationale**:
- Dept list is small (10-100 per org)
- Query is O(1) with proper indexes
- Invalidation complexity not worth it
- Can add caching in D1 phase if performance issues

**Rejected Alternative**: Cache dept list in Redis with TTL
- **Why rejected**: Premature optimization; adds invalidation logic; low query volume

---

## Migration Plan

### 0056_departments.sql
```sql
CREATE TABLE departments (...);
ALTER TABLE users ADD COLUMN department_id ...;
ALTER TABLE incidents ADD COLUMN department_id ...;
CREATE INDEXES ...;
```

### 0057_department_permissions.sql
```sql
INSERT INTO permissions (resource, action) VALUES ...;
UPDATE roles SET permissions = ... WHERE name IN ('master', 'admin_sistema', 'admin_organizacion');
UPDATE users SET permissions = ..., permission_version = ... WHERE role_id IN (...);
```

### Code Integration
- Add `DepartmentsModule` to `app.module.ts`
- Import `TypeOrmModule.forFeature([DepartmentEntity])` in module

---

## Rollback Path

1. Run `database/rollback/0057_department_permissions.sql` (remove perms, restore roles)
2. Run `database/rollback/0056_departments.sql` (drop columns, table, indexes)
3. Remove import in `app.module.ts`
4. Delete `/backend/src/modules/departments/` directory

No code changes needed elsewhere (FKs are nullable, incidents survive with `dept_id = NULL`)
