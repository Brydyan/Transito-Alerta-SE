-- Migration 0058: Department ↔ Incident Categories (M:N)
-- Transito Alerta SE — sibling of `back/2026-09-15-departments-module` /
-- `front/2026-09-15-departments-menu`. The Phase 8.5 (manual smoke)
-- surfaced that creating a dept is the right moment to capture which
-- incident categories the dept handles — without this, every incident
-- would have to manually pick the dept by hand and admins have no way
-- to scope a dept to "movilidad" vs "alumbrado".
--
-- The matrix UI is on `app/departamentos/new` (and `:id/edit`), one
-- checkbox per incident category. The assignment is M:N so a dept can
-- own several categories and a category can be handled by several depts
-- (no exclusivity — important for shared categories like "general").
--
-- Design notes (mirroring 0056's soft-delete + FK behavior):
--   - `CASCADE` on dept_id delete: removing the dept drops its
--     category assignments (no orphans).
--   - `CASCADE` on category_id delete: removing a category removes
--     it from every dept that held it. This is intentional — a
--     soft-deleted category should not be in anyone's active scope.
--     If you ever need a "restore" path, add an `archived_at` to
--     `incident_categories` and bump this FK to ON DELETE RESTRICT.
--   - The composite PK `(department_id, incident_category_id)` doubles
--     as the "no duplicate" guard at the DB level — no second UNIQUE
--     index needed.
--   - One supporting index on the reverse side `(incident_category_id)`
--     so the eventual "list depts that handle category X" query is fast.
--
-- Idempotent (`IF NOT EXISTS`) so a partial re-run doesn't fail.

BEGIN;

CREATE TABLE IF NOT EXISTS department_incident_categories (
    department_id         UUID NOT NULL
        REFERENCES departments(id)         ON DELETE CASCADE,
    incident_category_id   UUID NOT NULL
        REFERENCES incident_categories(id) ON DELETE CASCADE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (department_id, incident_category_id)
);

CREATE INDEX IF NOT EXISTS idx_dic_category
    ON department_incident_categories(incident_category_id);

COMMIT;
