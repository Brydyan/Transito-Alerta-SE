-- 0030_departments.sql
-- Transito Alerta SE — Departments Module — complete schema
-- `back/2026-09-15-departments-module`
--
-- Group C consolidation (2026-10-14): fused from:
--   0058_department_incident_categories — M:N junction table
--
-- Optional organizational subdivision (design D1): an organization may have
-- zero or many departments; users/incidents reference at most one. dept_id on
-- `users` and `incidents` is nullable with `ON DELETE SET NULL` so deleting a
-- dept (or its org, via CASCADE on the dept FK) leaves the user/incident rows
-- intact with dept_id = NULL (the "org-wide" scope, design D2).
--
-- Soft-delete pattern (D3) matches 0025_incidents_soft_delete + 0021.
-- UNIQUE(organization_id, name) matches the @Unique decorator on the entity.
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.
-- Requires 0015 (organizations_scoping), 0025 (incidents_soft_delete),
-- 0021 (soft_delete_completeness), 0021 (updated_at columns).
--
-- Rollback: database/rollback/0030_departments.DOWN.sql

BEGIN;

-- 1) departments table
CREATE TABLE IF NOT EXISTS departments (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    description     TEXT         NULL,
    organization_id UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ  NULL,
    CONSTRAINT uq_departments_org_name UNIQUE (organization_id, name)
);

-- 2) Covering index for the common list query:
--    WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY name ASC.
CREATE INDEX IF NOT EXISTS idx_departments_org_deleted
    ON departments(organization_id, deleted_at);

-- 3) Optional FK on users (nullable, SET NULL on dept delete)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS department_id UUID NULL
    REFERENCES departments(id) ON DELETE SET NULL;

-- 4) Partial index on users(department_id) — only non-deleted users.
CREATE INDEX IF NOT EXISTS idx_users_department
    ON users(department_id) WHERE deleted_at IS NULL;

-- 5) Optional FK on incidents (nullable, SET NULL on dept delete)
ALTER TABLE incidents
    ADD COLUMN IF NOT EXISTS department_id UUID NULL
    REFERENCES departments(id) ON DELETE SET NULL;

-- 6) Partial index on incidents(department_id) for the scoping query.
CREATE INDEX IF NOT EXISTS idx_incidents_department
    ON incidents(department_id) WHERE deleted_at IS NULL;

-- ════════════════════════════════════════════════════════════════════════
-- 7) Department ↔ Incident Categories M:N junction (fused from 0058)
--
--    A dept can own several categories and a category can be handled by
--    several depts (no exclusivity). CASCADE on both sides: deleting a
--    dept or a category removes its assignments automatically.
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS department_incident_categories (
    department_id         UUID NOT NULL
        REFERENCES departments(id)         ON DELETE CASCADE,
    incident_category_id  UUID NOT NULL
        REFERENCES incident_categories(id) ON DELETE CASCADE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (department_id, incident_category_id)
);

-- Reverse-side index: "list depts that handle category X" query.
CREATE INDEX IF NOT EXISTS idx_dic_category
    ON department_incident_categories(incident_category_id);

COMMIT;
