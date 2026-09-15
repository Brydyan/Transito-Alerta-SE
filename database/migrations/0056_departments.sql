-- Migration 0056: Departments Module — schema
-- Transito Alerta SE — `back/2026-09-15-departments-module`
--
-- Optional organizational subdivision (design D1): an organization may have
-- zero or many departments; users/incidents reference at most one. dept_id on
-- `users` and `incidents` is nullable with `ON DELETE SET NULL` so deleting a
-- dept (or its org, via CASCADE on the dept FK) leaves the user/incident rows
-- intact with dept_id = NULL (the "org-wide" scope, design D2).
--
-- Soft-delete pattern (D3) matches 0025_incidents_soft_delete + 0031.
-- UNIQUE(organization_id, name) matches the @Unique decorator on the entity.
--
-- MANUAL EXECUTION ONLY — ver 0001_initial_schema.sql header.
-- Requires 0015 (organizations_scoping), 0025 (incidents_soft_delete),
-- 0031 (soft_delete_completeness), 0032 (updated_at columns).
--
-- Rollback: database/rollback/0056_departments.DOWN.sql (DROPs in reverse order).

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

-- 2) Covering index for the common list query: WHERE organization_id = $1
--    AND deleted_at IS NULL ORDER BY name ASC.
CREATE INDEX IF NOT EXISTS idx_departments_org_deleted
    ON departments(organization_id, deleted_at);

-- 3) Optional FK on users (nullable, SET NULL on dept delete)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS department_id UUID NULL
    REFERENCES departments(id) ON DELETE SET NULL;

-- 4) Partial index on users(department_id) — only non-deleted users since
--    soft-deleted users don't participate in scoping.
CREATE INDEX IF NOT EXISTS idx_users_department
    ON users(department_id) WHERE deleted_at IS NULL;

-- 5) Optional FK on incidents (nullable, SET NULL on dept delete)
ALTER TABLE incidents
    ADD COLUMN IF NOT EXISTS department_id UUID NULL
    REFERENCES departments(id) ON DELETE SET NULL;

-- 6) Partial index on incidents(department_id) for the scoping query
--    (incident.dept_id = user.dept_id OR dept_id IS NULL).
CREATE INDEX IF NOT EXISTS idx_incidents_department
    ON incidents(department_id) WHERE deleted_at IS NULL;

COMMIT;
