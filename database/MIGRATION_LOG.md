# Migration Log

Per CC3 (Manual Migration Integrity) and design decision "TypeORM
`synchronize: false`, `migrationsRun: false`" — schema changes are NEVER
applied automatically by the application. Every migration in
`database/migrations/` is a plain `.sql` file that a human operator copies
into the Supabase SQL editor (or `psql`) and runs manually, in numeric
order. After running a migration, update its row below (Status, Applied By,
Applied Date, Environment). Never mark a migration `✅ Applied` until it has
actually been run against that environment.

---

## Consolidation notice — 2026-10-14

~80 addendum migrations (0020–0069) were fused into their feature anchors,
reducing the chain from 80 files to **31 sequential files (0001–0031)** with
no gaps or duplicate prefixes. Rollback files were updated in lockstep.

For **existing environments** (supabase staging, docker local) that already
ran the old individual files: the absorbed migrations are already applied —
do NOT re-run the new consolidated files on top of them.

For **new environments** (fresh DB bootstrap): run 0001–0031 in order.

Groups fused:

| Group | Anchor | Absorbed |
|-------|--------|----------|
| A | 0009 roles_permissions | 0039 + 0043 + 0047 + 0049 + 0050 + 0052 + 0053 |
| B | 0029 dynamic_menus_data | 0055 + 0057 + 0059 + 0060 + 0061 + 0063 + 0064 + 0066 |
| C | 0012 incident_categories | 0062 + 0065 |
| C2 | 0030 departments | 0057_dept_perms + 0058_dept_incident_categories |
| D | 0022 t7_schema_completeness | 0033 → 0038 |
| E | 0020 incident_state_machine | 0020_old → 0023 + 0044 + 0068 |
| F | 0021 t6_t7_schema_completeness | 0024 → 0032 |
| G | 0025 aud_anon_module | 0045 + 0046 + 0048 + 0067 |
| H | 0023 t7_data_migrations | 0040 + 0041 |

### Nota de consolidación 2026-10-14 — front/2026-10-14-admin-route-guards

`READ system-config` (diseñado como migración `0070` en el change
`front/2026-10-14-admin-route-guards`) fue consolidado en `0009` durante la
refactorización Group A del mismo día. No existe archivo `0070_*.sql`
independiente. Ver commit `1bbccfec3`.

---

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
| 0009 | roles_permissions | **Group A** (fused 2026-10-14): roles.permissions jsonb, permissions catalog, users.role_id + pv, reporter role; + catalog gaps (notifications, dashboard, assignments CRUD, audit-logs, users CRUD, roles CRUD) + permission grants (incident_close CLOSE, reveal REVEAL) + UUID format normalization for roles.permissions. Absorbed: 0039 + 0043 + 0047 + 0049 + 0050 + 0052 + 0053 | ✅ Applied | Andy Alejandro | 2026-08-16 | supabase |
| 0010 | user_email | adds nullable `users.email` + unique partial index (design D11) | ✅ Applied | Andy Alejandro | 2026-08-16 | supabase |
| 0011 | notifications | notifications table (user_id FK, incident_id FK, type, message, data jsonb, read bool, timestamps) + indexes | ✅ Applied | Andy Alejandro | 2026-08-16 | supabase |
| 0012 | incident_categories | **Group C** (fused 2026-10-14): incident_categories adjacency-list table + incidents.category_id FK + RESTRICT + index + permissions catalog; + `description text NULL` + `priority varchar(16) NULL` columns. Absorbed: 0062 + 0065 | ✅ Applied | Andy Alejandro | 2026-08-16 | supabase |
| 0013 | geo_zones_hierarchy | adds `geo_zones.parent_id` self-FK ON DELETE SET NULL, `geo_zones.level` CHECK + index; backfills 4 seeded zones; permission catalog rows for `geo-zones` resource | ✅ Applied | Andy Alejandro | 2026-08-16 | supabase |
| 0014 | status_history | append-only `status_history` table (uuid PK, incident_id FK CASCADE, changed_by_user_id FK SET NULL, previous_status/new_status CHECKed, event_id UNIQUE) + index + `('status-history','READ')` permission row | ✅ Applied | Andy Alejandro | 2026-08-17 | supabase + local (tase-postgres) |
| 0015 | organizations_scoping | partial UNIQUE index on organizations(zone_id); incidents.organization_id FK + index; backfill by zone_id join; 4 organizations permission rows; seeds master, operador_sistema, admin_org, operator_org roles | ✅ Applied | Andy Alejandro | 2026-08-17 | supabase + local (tase-postgres) |
| 0016 | sessions_revocation | 8 nullable columns on user_sessions (refresh_token_hash, rotation, ip, user_agent, revoked_at, last_used_at, expires_at) + 2 partial indexes; sessions:READ/DELETE granted to master/admin_org | ✅ Applied | Andy Alejandro | 2026-08-21 | supabase |
| 0017 | users_password_identity | users.password_hash char(60) nullable (bcrypt); users.device_uuid + user_sessions.device_uuid relaxed to nullable; device_uuid UNIQUE kept (tolerates many NULLs) | ✅ Applied | Andy Alejandro | 2026-08-21 | supabase |
| 0018 | invitations | invitations + password_reset_tokens tables (single-use tokens, 48h/24h); 3 invitations permission rows granted to master/admin_org | ✅ Applied | Andy Alejandro | 2026-08-21 | supabase |
| 0019 | incident_claim | incidents.claimed_by FK SET NULL + partial index; organizations.max_active_claims CHECK > 0; extends permissions.action CHECK to full domain (includes CLAIM, RELEASE, CLOSE, REVEAL); seeds CLAIM/RELEASE permission rows; grants to operator_org + agent_system | ✅ Applied | Andy Alejandro | 2026-08-23 | supabase |
| 0020 | incident_state_machine | **Group E** (fused 2026-10-14): extends incidents.status CHECK with `closed`; approved/rejected decision columns (5 cols, 3 CHECKs, 1 partial index); extends notifications.type CHECK with `incident_pending_approval`; status_history.notes text NULL; incidents.closed_reason text NULL; expands status_history CHECKs to full domain (previous_status adds `created` sentinel; new_status adds `closed`). Absorbed: 0020_old + 0021 + 0022 + 0023 + 0044 + 0068 | ⏳ Pending | — | — | — |
| 0021 | t6_t7_schema_completeness | **Group F** (fused 2026-10-14): comment_images table; incidents.deleted_at + partial index; assignments soft-delete + partial UNIQUE uq_assignments_active; incidents.claimed_at + resolution_date; users OTP compliance (6 cols); incident_images table; schema_migrations tracking table + conditional backfill 0001–0020; deleted_at on 13 tables; updated_at + set_updated_at() trigger on 15 tables. Absorbed: 0024 → 0032 | ⏳ Pending | — | — | — |
| 0022 | t7_schema_completeness | **Group D** (fused 2026-10-14): comments.parent_id self-FK + depth-2 app constraint; organizations.parent_id self-FK + incident_category_id FK; geo_zones.code varchar(32) partial UNIQUE + users.phone varchar(30); check_is_leaf_category() trigger; 4 missing indexes; 22-category tree seed (5 roots + 17 leaves). **+sc-446 follow-up (2026-10-14):** users.geo_zone_id uuid NULL FK geo_zones ON DELETE SET NULL + partial index. Absorbed: 0033 → 0038 | ⏳ Pending | — | — | — |
| 0023 | t7_data_migrations | **Group H** (fused 2026-10-14): role renames (admin_sistema→master, admin_organizacion→admin_org, operador_organizacion→operator_org); geo_zones.code backfill on 4 rows; 11 parroquias Santa Elena seed (OSM/ODbL 1.0); CTE-Santa-Elena org insert. Load-bearing order: rename → parroquia → org. Absorbed: 0040 + 0041 | ⏳ Pending | — | — | — |
| 0024 | monitoring_helpers | 6 PL/pgSQL `STABLE` functions (`monitor_incidents_per_minute`, `monitor_endpoint_latency_p95`, `monitor_5xx_count`, `monitor_pg_pool_usage`, `monitor_revocation_denylist_size`, `monitor_unread_notifications_count`). Read-only, idempotent (`CREATE OR REPLACE`). Renumbered from 0042 (2026-10-14) | ✅ Applied | Andy Alejandro | 2026-08-27 | supabase staging |
| 0025 | aud_anon_module | **Group G** (fused 2026-10-14): audit_events table (actor_id, action, resource_type/id, justification, metadata, indexes); incident_reporters table + incidents.is_anonymous bool; UPDATE users SET permissions='[]' for anonymous mask (close ceiling); insert-or-repair anonymous mask row (device_uuid='anonymous'). Absorbed: 0045 + 0046 + 0048 + 0067 | ⏳ Pending | — | — | — |
| 0026 | roles_permissions_uuid_format | Normalizes roles.permissions (jsonb array) from string format ("READ incidents") to UUID catalog references. Denormalizes to users.permissions + bumps permission_version. Renumbered from 0051 (2026-10-14) | ✅ Applied | Andy Alejandro | 2026-09-09 | supabase |
| 0027 | citizen_social_features | incident_followers + incident_corroborations permission catalog rows; grants to 4 staff roles; denormalizes + bumps permission_version. Renumbered from 0054 (2026-10-14) | ✅ Applied | Andy Alejandro | 2026-09-14 | supabase |
| 0028 | dynamic_menus_schema | menu_options (self-ref adjacency, soft delete), menu_option_roles (composite PK), api_endpoints (UNIQUE method+path), menu_option_endpoints junction; roles.scope varchar(20) CHECK; menu-options permission catalog; seeds api_endpoints with current routes. Renumbered from 0054_dynamic_menus_schema (2026-10-14) | ✅ Applied | carlosfpatino | 2026-09-14 | docker local (tase-postgres) |
| 0029 | dynamic_menus_data_migration | **Group B** (fused 2026-10-14): 10 MENU_MAP entries → menu_options + menu_option_roles; Controles option; sanitize roles matrix (soft-delete legacy names); 12 CRUD sub-menu entries; inherit parent permissions; GESTIÓN + Departamentos access matrix; fix Organizaciones/Departamentos routes; grants status-history:READ to roles with incidents:READ. Absorbed: 0055 + 0057 + 0059 + 0060 + 0061 + 0063 + 0064 + 0066 | ⏳ Pending | — | — | — |
| 0030 | departments | **Group C2** (fused 2026-10-14): departments table (org FK CASCADE, soft delete, UNIQUE org+name); users.department_id + incidents.department_id FKs SET NULL + partial indexes; 4 departments permission rows granted to master + admin_org; department_incident_categories junction table + index. Absorbed: 0056_departments + 0057_dept_perms + 0058_dept_incident_categories | ⏳ Pending | — | — | — |
| 0031 | emergency_dispatch | users.telegram_chat_id text NULL; assignments.cap_override_reason + cap_override_by uuid FK; incidents.reminder_count int DEFAULT 0 + last_reminded_at timestamptz NULL. No new permissions (ASSIGN already in master+admin_org per 0015). Renumbered from 0069 (2026-10-14) | ⏳ Pending | — | — | — |
| 0032 | departments_soft_delete_unique | Drop plain UNIQUE(organization_id, name) on departments; replace with partial unique index WHERE deleted_at IS NULL. Fixes: soft-deleted dept blocks re-creation of same name in same org. | ⏳ Pending | — | — | — |
| 0033 | user_notification_channel | users.preferred_notification_channel varchar(20) NOT NULL DEFAULT 'email'. Stores email | telegram preference; no dispatch logic in this change. Future channels possible without ALTER TYPE (D4). | ⏳ Pending | — | — | — |
| 0034 | incident_images_drop_url | incident_images: DROP COLUMN url + DELETE all rows. The column was an unused duplicate of the storage location; the pre-change storage service stub fabricated URLs against never-uploaded objects. (D2 of 2026-10-06-incident-images-read-path.) | ⏳ Pending | — | — | — |
| 0035 | audit_events_actor_set_null | audit_events.actor_id: DROP NOT NULL + change FK from ON DELETE RESTRICT to ON DELETE SET NULL. Audit trails must survive physical user deletion (GDPR); actor_id becomes NULL for deleted actors. Required after audit wiring in sc-327 added citizen actor rows. | ⏳ Pending | — | — | — |
| 0036 | users_phone_unique | Partial unique index `uq_users_phone` ON users(phone) WHERE phone IS NOT NULL. Prevents duplicate phone across active users; soft-deleted users (whose phone is wiped to NULL) are excluded naturally. Service layer pre-check (adminCreate/adminUpdate) gives 409 with friendly message; updateProfile catches 23505 from the index. | ⏳ Pending | — | — | — |
| 0037 | admin_org_reassign_permission | Adds `UPDATE assignments` to `admin_org` role permissions JSONB array. Required for `PATCH /api/assignments/:id` — without it admin_org receives 403 when attempting to reassign an incident to another operator. Idempotent: skips if already present. Rollback: `database/rollback/0037_admin_org_reassign_permission.DOWN.sql`. | ⏳ Pending | — | — | — |

## Status legend

- ⏳ Pending — written, not yet applied to any environment
- ✅ Applied — applied and verified in the environment listed
- ❌ Rolled back — applied then reverted via the matching `database/rollback/*.DOWN.sql`

## Backfill de migraciones aplicadas manualmente (operational)

### Contexto

El runner (`backend/scripts/run-migrations.ts`) confía en que
`schema_migrations` refleje **todas** las migraciones aplicadas. Cuando
una migración se aplicó vía `psql` directo (bootstrap inicial, hot-fix
de emergencia, o antes de que el runner existiera), queda **huérfana**:
el esquema tiene los objetos pero la tabla de tracking no tiene la fila.

Síntomas típicos:

- `ls database/migrations/*.sql | wc -l` retorna un número mayor que
  `SELECT COUNT(*) FROM schema_migrations`.
- Próximas corridas del runner lanzan `ERROR: ... already exists` para
  migraciones que ya están aplicadas (eco benigno, pero enmascara drift
  real cuando se añade una nueva).
- El merge de una rama con migraciones nuevas puede fallar porque el
  runner detecta drift sobre las filas faltantes.

### Caso real — `tase-staging` 2026-10-18

`SELECT COUNT(*) FROM schema_migrations` devolvía **24** mientras que
`ls database/migrations/*.sql` sumaba **37**. Los 13 huérfanos eran:
`0021, 0022, 0024, 0025, 0026, 0029, 0030, 0031, 0032, 0033, 0034,
0035, 0037`.

Verificación de que estaban aplicados (no eran drift real):

- `pg_constraint` contenía `fk_organizations_zone` (creado por `0002`).
- `pg_indexes` contenía `uq_users_phone` (creado por `0036`).
- `roles` contenía `master`, `admin_org`, `operator_org` (creados por
  `0023`).

Tras el backfill, `schema_migrations` quedó con las **37** filas
contiguas `0001 → 0037`.

### Procedimiento

1. **Identificar los gaps** cruzando archivos en disco con filas
   registradas:

   ```bash
   # en el host del repo
   ls database/migrations/*.sql | wc -l

   # en el server (docker) — listar versiones presentes
   docker exec -i tase-postgres psql -U postgres -d transito_alerta \
     -c "SELECT version FROM schema_migrations ORDER BY version;"
   ```

   Los IDs presentes en disco pero NO en la tabla son los huérfanos.

2. **Calcular checksums reales desde los archivos en disco**:

   ```bash
   sha256sum database/migrations/0021_t6_t7_schema_completeness.sql \
              database/migrations/0022_t7_schema_completeness.sql \
              # ... los que falten
   ```

   ⚠️ **NO usar placeholders** — el runner detecta ediciones
   post-aplicación vía checksum mismatch y falla en silencio (exit 0,
   pero reporta drift).

3. **Insertar las filas faltantes con `docker exec -i` (sin `-t`)**.
   Con `-t`, Docker aborta con `cannot attach stdin to a TTY-enabled
   container because stdin is not a terminal` al recibir un heredoc.

   ```bash
   docker exec -i tase-postgres psql -U postgres -d transito_alerta <<'SQL'
   INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES
     ('0021', 't6_t7_schema_completeness', '<sha256-de-0021>', NOW()),
     ('0022', 't7_schema_completeness',    '<sha256-de-0022>', NOW())
     -- ... el resto
   ON CONFLICT (version) DO NOTHING;
   SQL
   ```

   `ON CONFLICT (version) DO NOTHING` hace el INSERT idempotente:
   correrlo dos veces no duplica ni revienta.

4. **Verificar**:

   ```bash
   docker exec -i tase-postgres psql -U postgres -d transito_alerta \
     -c "SELECT COUNT(*) FROM schema_migrations;"
   # esperado: 37 (= número de archivos .sql en disco)
   ```

5. **Marcar `applied_at = NOW()`** — es OK. Si en el futuro una query
   de auditoría necesita distinguir "backfilleado manualmente" de
   "aplicado por el runner", se puede agregar una columna
   `applied_by varchar(64)` y poblarla con `'manual-backfill'` para
   distinguirlo. Hoy el log en este archivo es suficiente.

### Cuándo **NO** backfill-ear

- Si una migración aparece como ⏳ Pending en este log **Y** no tiene
  objetos en el esquema, es drift real — la solución es aplicarla con
  el runner o manualmente, NO backfill-ear la fila (eso solo escondería
  la ausencia).
- Si el checksum del archivo en disco NO coincide con el del archivo
  original aplicado, hay una edición post-aplicación — hay que
  investigar antes de tocar `schema_migrations`. Si la edición fue
  intencional (ej. fix retroactivo), primero re-aplicar el SQL correcto
  y luego backfill-ear con el checksum actual.

## Entorno local de desarrollo

`docker compose up -d postgres` levanta `postgis/postgis:16-3.4` vacío. Las
mismas migraciones se aplican ahí a mano, en el mismo orden:

```bash
for f in database/migrations/00*.sql; do
  docker exec -i tase-postgres psql -U postgres -d transito_alerta \
    -v ON_ERROR_STOP=1 -q < "$f" || break
done
```

El job `migrations` de CI (`.github/workflows/ci.yml`) aplica las 31 en orden
contra un `postgis/postgis:16-3.4` vacío en cada PR, así que un archivo roto se
detecta antes de pegarlo en el editor SQL de Supabase.

Este log rastrea **supabase**. El entorno local se recrea desde cero cuando
haga falta (`docker compose down -v`), así que no lleva registro propio.
