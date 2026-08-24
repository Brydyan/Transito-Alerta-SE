# Migration Log

Per CC3 (Manual Migration Integrity) and design decision "TypeORM
`synchronize: false`, `migrationsRun: false`" — schema changes are NEVER
applied automatically by the application. Every migration in
`database/migrations/` is a plain `.sql` file that a human operator copies
into the Supabase SQL editor (or `psql`) and runs manually, in numeric
order. After running a migration, update its row below (Status, Applied By,
Applied Date, Environment). Never mark a migration `✅ Applied` until it has
actually been run against that environment.

## Log

| ID | Name | Description | Status | Applied By | Applied Date | Environment |
|----|------|-------------|--------|-----------|---------------|-------------|
| 0001 | initial_schema | users, organizations, roles tables + anonymous identity seed row | ✅ Applied | Andy Alejandro | 2026-08-15 | supabase |
| 0002 | add_postgis_and_geo_zones | PostGIS extension, geo_zones table + GIST index, organizations.zone_id FK | ✅ Applied | Andy Alejandro | 2026-08-15 | supabase |
| 0003 | seed_geo_zones | Santa Elena province + 3 cantons (EC-24, EC-24-01/02/03) geo_zones seed data | ✅ Applied | Andy Alejandro | 2026-08-15 | supabase |
| 0004 | incidents | incidents table (Point location, status/priority, zone_id/geofence_matched, GIST index) | ✅ Applied | Andy Alejandro | 2026-08-15 | supabase |
| 0005 | comments | comments table (sanitized content, FK incidents/users) | ✅ Applied | Andy Alejandro | 2026-08-15 | supabase |
| 0006 | users | users profile columns (first/last name, avatar_url, role, organization_id) + user_sessions table | ✅ Applied | Andy Alejandro | 2026-08-15 | supabase |
| 0007 | assignments | assignments table (one active assignment per incident, unique constraint) | ✅ Applied | Andy Alejandro | 2026-08-15 | supabase |
| 0008 | anonymous_read_comments | adds "READ comments" to the anonymous ceiling (product decision: read + contribute, never modify) | ✅ Applied | Andy Alejandro | 2026-08-15 | supabase |
| 0009 | roles_permissions | roles.permissions jsonb column, permissions catalog table, users.role_id + users.permission_version (pv), seeded 'reporter' role replacing the T1.4 inline stub | ✅ Applied | Andy Alejandro | 2026-08-16 | supabase |
| 0010 | user_email | adds nullable `users.email` + unique partial index (design D11) — address source for Mail module (T3.5) event-routing recipients | ✅ Applied | Andy Alejandro | 2026-08-16 | supabase |
| 0011 | notifications | notifications table (user_id FK, incident_id FK, type, message, data jsonb, read bool, created_at + processed_at timestamps) + indexes on (user_id, created_at) and (user_id, read) for list and count queries (T3.3) | ✅ Applied | Andy Alejandro | 2026-08-16 | supabase |
| 0012 | incident_categories | incident_categories adjacency-list table (uuid PK, self-FK `parent_id` ON DELETE SET NULL) + index; `incidents.category_id` ON DELETE RESTRICT + index; permission catalog rows for the `incident-categories` resource (T3.7) | ✅ Applied | Andy Alejandro | 2026-08-16 | supabase |
| 0013 | geo_zones_hierarchy | adds `geo_zones.parent_id` self-FK ON DELETE SET NULL and `geo_zones.level` with a CHECK over (provincia, canton, parroquia, zona) + index; backfills the seeded Santa Elena province and its 3 cantons by deterministic UUID; permission catalog rows for the `geo-zones` resource (T3.8). Depends on the 0003 seed having run | ✅ Applied | Andy Alejandro | 2026-08-16 | supabase |
| 0014 | status_history | append-only `status_history` table (uuid PK, `incident_id` FK ON DELETE CASCADE, `changed_by_user_id` FK ON DELETE SET NULL, `previous_status`/`new_status` CHECKed against the incident status vocabulary, `event_id` UNIQUE for idempotent Streams inserts) + `(incident_id, created_at, id)` index; single `('status-history','READ')` permission catalog row (T3.4) | ✅ Applied | Andy Alejandro | 2026-08-17 | supabase + local (tase-postgres) |
| 0015 | organizations_scoping | partial UNIQUE index on `organizations(zone_id)` created FIRST so a two-orgs-one-zone anomaly aborts the migration instead of backfilling an arbitrary tenant; `incidents.organization_id` FK ON DELETE SET NULL + `(organization_id, created_at DESC)` index; backfill joining `incidents.zone_id` -> `organizations.zone_id` (rows with `zone_id IS NULL` stay NULL — a real unassigned state, not a failure); 4 `organizations` permission catalog rows; seeds the 4 staff roles (admin_sistema, operador_sistema, admin_organizacion, operador_organizacion) — `reporter` already seeded by 0009 and untouched (T3.2). Independent of 0014 in both directions | ✅ Applied | Andy Alejandro | 2026-08-17 | supabase + local (tase-postgres) |
| 0016 | sessions_revocation | additive `ALTER TABLE user_sessions` — 8 nullable columns (`refresh_token_hash`, `previous_refresh_token_hash`, `rotated_at`, `ip_address`, `user_agent`, `revoked_at`, `last_used_at`, `expires_at`); `expires_at` backfilled to `created_at` for pre-existing rows; 2 partial indexes (`idx_user_sessions_active`, `idx_user_sessions_revoked`); `sessions` permission catalog rows (`READ`, `DELETE`) appended to `admin_sistema`/`admin_organizacion` role matrices (T3.9). Requires 0015 (staff roles) — aborts loudly otherwise. Verified idempotent (applied twice) and rollback-clean against local Postgres 2026-08-17 | ✅ Applied | Andy Alejandro | 2026-08-21 | supabase |
| 0017 | users_password_identity | `users.password_hash char(60)` (nullable, bcrypt); `users.device_uuid` and `user_sessions.device_uuid` relaxed to nullable — identity moves to email for password-identity users while `users_device_uuid_key` is KEPT (UNIQUE tolerates many NULLs, D7). Requires 0010 (`users.email`) — aborts loudly otherwise (T3.6) | ✅ Applied | Andy Alejandro | 2026-08-21 | supabase |
| 0018 | invitations | `invitations` table (single-use 48h token, `token_hash` UNIQUE, `accepted_at` is the sole used-state) + `password_reset_tokens` table (single-use 24h token, same shape); 3 `invitations` permission catalog rows (`CREATE`/`READ`/`DELETE`) appended to `admin_sistema`/`admin_organizacion` role matrices. Requires 0015 (staff roles) and 0017 (T3.6) | ✅ Applied | Andy Alejandro | 2026-08-21 | supabase |
| 0019 | incident_claim | adds `incidents.claimed_by uuid REFERENCES users(id) ON DELETE SET NULL` + partial index `idx_incidents_claimed_by`; `organizations.max_active_claims int NOT NULL DEFAULT 5 CHECK (> 0)`; extends the `permissions.action` CHECK constraint to admit `CLAIM` and `RELEASE` (in lockstep with the `PermissionAction` union in `src/common/decorators/require-permission.decorator.ts`); seeds the two new permission rows; grants both to `operador_organizacion` and `operador_sistema` via the `roles.permissions` JSONB column (the same pattern 0018 uses — the project has no `role_permissions` table; T5.1). | ✅ Applied | Andy Alejandro | 2026-08-23 | supabase |

## Status legend

- ⏳ Pending — written, not yet applied to any environment
- ✅ Applied — applied and verified in the environment listed
- ❌ Rolled back — applied then reverted via the matching `database/rollback/*.DOWN.sql`

## Entorno local de desarrollo

`docker compose up -d postgres` levanta `postgis/postgis:16-3.4` vacío. Las
mismas migraciones se aplican ahí a mano, en el mismo orden:

```bash
for f in database/migrations/000*.sql; do
  docker exec -i tase-postgres psql -U postgres -d transito_alerta \
    -v ON_ERROR_STOP=1 -q < "$f" || break
done
```

Estado local al 2026-08-15: 0001–0008 aplicadas y verificadas.

El job `migrations` de CI (`.github/workflows/ci.yml`) aplica las 13 en orden
contra un `postgis/postgis:16-3.4` vacío en cada PR, así que un archivo roto se
detecta antes de pegarlo en el editor SQL de Supabase. Verificado el 2026-08-16:
las 13 aplican limpio y el backfill de 0013 deja la provincia como raíz con sus
3 cantones colgando.

Este log rastrea **supabase**. El entorno local se recrea desde cero cuando
haga falta (`docker compose down -v`), así que no lleva registro propio.

## 0019 — T5.1 Incident Workflow (2026-08-23)

✅ Applied (Supabase staging, pendiente prod).

- Adds `incidents.claimed_by uuid REFERENCES users(id) ON DELETE SET NULL`.
- Adds `organizations.max_active_claims int NOT NULL DEFAULT 5 CHECK (> 0)`.
- Extends `permissions.action` CHECK constraint: now also allows `CLAIM` and `RELEASE`.
- Seeds `(incidents, CLAIM)` and `(incidents, RELEASE)` permission rows.
- Grants both to `operador_organizacion` and `operador_sistema` via the
  `roles.permissions` JSONB column (the same pattern 0018 uses — the project
  has no `role_permissions` table).

TypeScript side: `PermissionAction` union in
`backend/src/common/decorators/require-permission.decorator.ts` extended to
include `'CLAIM' | 'RELEASE'` in lockstep.
| 0020 | add_closed_status_to_incidents | extends the `incidents.status` CHECK constraint to allow `closed` (admin approve terminal state). Required by T5.6 approve flow; the transition is wired through the dedicated `approve()` path, not through `LEGAL_TRANSITIONS` | ✅ Applied | Andy Alejandro | 2026-08-23 | supabase |
| 0021 | add_decision_columns_to_incidents | adds `approved_by/at`, `rejected_by/at`, `rejection_reason` (nullable) + 3 CHECK constraints (approved pair, rejected pair, XOR) + partial index `idx_incidents_approved_at` (T5.6) | ✅ Applied | Andy Alejandro | 2026-08-23 | supabase |
| 0022 | add_incident_pending_approval_notification_type | extends the `notifications.type` CHECK constraint to allow `incident_pending_approval` — the value emitted when an incident hits `resolved` and waits for admin moderation (T5.6) | ✅ Applied | Andy Alejandro | 2026-08-23 | supabase |
| 0023 | add_notes_to_status_history | adds `notes` (nullable text) to `status_history` — written by the T5.6 reject path with the rejection reason as a permanent audit row | ✅ Applied | Andy Alejandro | 2026-08-23 | supabase |
| 0024 | comment_images | `comment_images` table (uuid PK, `comment_id` FK ON DELETE CASCADE, `storage_key`, `url`, `mime_type`, `file_size` CHECK > 0, `created_at`); index on `comment_id`; permission catalog rows for `comment-images` resource (CREATE, DELETE); grants both to operator + admin roles via `roles.permissions` JSONB (T5.5). Note: tasks.md designated 0020 but that slot was taken by T5.6 migrations. | ✅ Applied | Andy Alejandro | 2026-08-24 | supabase |
| 0025 | incidents_soft_delete | `incidents.deleted_at TIMESTAMPTZ NULL` + partial index `idx_incidents_deleted_at WHERE deleted_at IS NULL` (T6.2). All list/findOne queries filter `AND deleted_at IS NULL`. | ✅ Applied | Andy Alejandro | 2026-08-24 | supabase |
| 0026 | assignments_soft_delete | `assignments.deleted_at TIMESTAMPTZ NULL`; drops hard `assignments_incident_id_operator_id_key` UNIQUE; creates partial UNIQUE `uq_assignments_active WHERE deleted_at IS NULL` + `idx_assignments_deleted_at` (T6.2). | ✅ Applied | Andy Alejandro | 2026-08-24 | supabase |
| 0027 | incidents_metrics_cols | `incidents.claimed_at TIMESTAMPTZ NULL` and `incidents.resolution_date TIMESTAMPTZ NULL`; index `idx_incidents_resolution_date WHERE resolution_date IS NOT NULL` (T6.3). | ✅ Applied | Andy Alejandro | 2026-08-24 | supabase |
| 0028 | users_otp_compliance | 6 columns on users: `email_verified_at`, `verification_otp VARCHAR(6)`, `verification_otp_expires_at`, `terms_accepted_at`, `terms_version VARCHAR(20)`, `deleted_at`; indexes for unverified and deleted lookups (T6.5, T6.8). | ✅ Applied | Andy Alejandro | 2026-08-24 | supabase |
| 0029 | incident_images | `incident_images` table (uuid PK, `incident_id` FK ON DELETE CASCADE, `storage_key`, `url`, `mime_type`, `file_size` CHECK > 0, `created_at`); index on `incident_id`; permission catalog rows `incident-images:CREATE` and `incident-images:DELETE`; grants to `operador_organizacion` and `admin_organizacion` (T6.6). | ✅ Applied | Andy Alejandro | 2026-08-24 | supabase |
