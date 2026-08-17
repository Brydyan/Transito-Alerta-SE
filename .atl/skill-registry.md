# Skill Registry

**Generated**: 2026-08-16  
**Project**: Transito-Alerta-SE Backend (NestJS)  
**Scope**: Applicable to all SDD phases (T3.7+)

## Compact Rules

### NestJS Module Structure
**Files**: `src/modules/{module-name}/`  
**Pattern**: Entity → Repository → Service → Controller → DTO  
**When Applied**: Every new module creation (T3.7, T3.8, etc.)  
**Rule**: Follow established folder structure, use @Injectable() for services, create DTOs with class-validator.

### Repository Pattern
**Files**: `src/modules/{module}/repository.ts`, `entities/`.  
**Pattern**: Custom repository with `create()`, `findById()`, `paginate(filters)`, `update()`, `softDelete()`.  
**When Applied**: Data access layer for all modules.  
**Rule**: Avoid TypeORM QueryBuilder in controllers; encapsulate in repository.

### Soft Deletes
**Files**: Entity files with @DeleteDateColumn().  
**Pattern**: All domain entities use soft deletes (deleted_at NULL check in queries).  
**When Applied**: Entity creation.  
**Rule**: Always add `deleted_at TIMESTAMP NULL` to migration, @DeleteDateColumn() decorator.

### RBAC & Permissions
**Files**: `src/modules/roles/`, `@RequirePermission()` decorator usage.  
**Pattern**: Endpoint guards check user.permissions array against required action.  
**When Applied**: Controller endpoints.  
**Rule**: Use `@UseGuards(PermissionGuard)` + `@RequirePermission('ACTION entity')` on all write endpoints.

### Testing (Strict TDD)
**Files**: `src/**/*.spec.ts`, `test/e2e/**/*.e2e-spec.ts`.  
**Pattern**: Jest with Testcontainers (real DB/Redis), mock services, test both happy path and error cases.  
**When Applied**: Always before implementation.  
**Rule**: Write tests first; implementation must pass 257+ unit tests and 31+ E2E tests.

### Redis Streams Consumers
**Files**: `src/modules/*/consumer.ts`, `src/core/core.module.ts`.  
**Pattern**: OnModuleInit → XGROUP CREATE, loop with XREADGROUP BLOCK, XACK per entry, OnModuleDestroy → quit.  
**When Applied**: Async event processing (mail, notifications).  
**Rule**: Use dedicated Redis connection (@Inject(BLOCKING_CLIENT)), implement sweep for stalled entries.

### PostGIS & Geofencing
**Files**: `src/modules/geofencing/`, entities with `@Column({ type: 'geometry' })`.  
**Pattern**: ST_Contains for point-in-polygon, order by level specificity, ancestors chain via recursion.  
**When Applied**: Geo queries (T3.8 Locations).  
**Rule**: Use ST_Contains + orderByRaw for specificity; migration must create GIST index.

### Migration Pattern
**Files**: `backend/database/migrations/`, named `YYYY_MM_DD_HHMM_description.sql`.  
**Pattern**: TypeORM raw SQL, FK constraints, indexes, check constraints.  
**When Applied**: Schema changes.  
**Rule**: One logical change per migration; include both `up()` and `down()`.

## User Skills & Conventions

**Global Instructions**: `/home/andy/.claude/CLAUDE.md`  
- Engram persistent memory (proactive `mem_save`)
- Caveman mode (terse responses)
- Session close: always call `mem_session_summary`

**Project Configuration**: `openspec/config.yaml` (raíz del repo; los comandos corren desde `backend/`)  
- Strict TDD enabled
- Jest as test runner
- Hybrid artifact storage (openspec + Engram)

## Stack-Specific Conventions

### NestJS Best Practices
- Use `@Inject()` for dependency injection
- Services are @Injectable() singletons
- Controllers delegate to services (no business logic in handlers)
- Use DTOs + class-validator for input validation
- Throw HttpException subclasses (NotFoundException, BadRequestException, etc.)

### TypeORM Patterns
- Entities with @Entity(), @Column(), @PrimaryGeneratedColumn()
- Relations via @ManyToOne(), @OneToMany(), @JoinColumn()
- Migrations in raw SQL (not TypeORM sync)
- Repositories extend TypeORM Repository pattern (custom methods)

### Testing
- Unit: Jest with mocked services
- Integration: Testcontainers (real DB/Redis)
- E2E: Full app via SuperTest
- Always test happy path + error paths

### Git & Commits
- Commits: `type(scope): message` (feat, fix, test, docs, refactor)
- Co-author: `Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>`
- Branch: `brydyan/sc-256/fase-{phase}-{module}`

## Inference Rules

When no explicit rule matches, default to:
1. **For HTTP APIs**: RESTful routes (GET /list, POST /create, PATCH /:id, DELETE /:id)
2. **For queries**: Pagination with filters (search, parent_id, level, per_page)
3. **For errors**: Throw HttpException with clear message + 4xx/5xx status
4. **For testing**: Unit + E2E coverage (no integration tests without real deps)

---

**Last Updated**: 2026-08-16  
**Maintenance**: Regenerate when adding new skill files or conventions.
