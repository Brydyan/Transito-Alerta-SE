-- 0038_reference_data.sql
-- Transito Alerta SE — T7.9.A: incident category tree seed.
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header. Requires 0012
-- (incident_categories table) and 0036 (check_is_leaf_category trigger)
-- applied first — the leaf trigger must exist before real incidents can be
-- created against these categories.
--
-- `incident_categories` has existed since 0012 with zero rows (design.md
-- §1.4 audit: "nuestro esquema de catálogo está bien portado pero vacío").
-- This migration seeds the global category tree legacy builds in
-- `IncidentCategorySeeder`: 5 root categories, each with a fixed set of leaf
-- categories. Names are copied verbatim from
-- GeoReporta/backend/database/seeders/IncidentCategorySeeder.php — 5 roots +
-- 17 leaves = 22 categories total (design.md D14 corrects this change's
-- earlier 23/18 estimate against the actual seeder source).
--
-- Idempotency (design.md D11): Postgres does not fold NULL into a UNIQUE
-- violation, so the 5 root categories (parent_id IS NULL) need a separate
-- partial UNIQUE index from the leaves (parent_id IS NOT NULL). Both indexes
-- MUST be created before the seed INSERT below — otherwise `ON CONFLICT` has
-- no matching arbiter index and re-applying this file duplicates the tree.
--
-- Rollback: database/rollback/0038_reference_data.DOWN.sql

BEGIN;

-- T7.9.A2 — idempotency indexes, created before the seed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_incident_categories_root
  ON incident_categories (name) WHERE parent_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_incident_categories_child
  ON incident_categories (name, parent_id) WHERE parent_id IS NOT NULL;

-- T7.9.A3 — seed the tree. Parent ids are resolved by name in a CTE, never
-- hardcoded, so this file is safely re-runnable against a base that already
-- has the tree (or a subset of it, e.g. partially applied by hand).
WITH roots AS (
  INSERT INTO incident_categories (id, name, parent_id, created_at, updated_at)
  VALUES
    (gen_random_uuid(), 'Infraestructura Vial', NULL, now(), now()),
    (gen_random_uuid(), 'Servicios Básicos', NULL, now(), now()),
    (gen_random_uuid(), 'Seguridad Ciudadana', NULL, now(), now()),
    (gen_random_uuid(), 'Medio Ambiente', NULL, now(), now()),
    (gen_random_uuid(), 'Obras e Infraestructura', NULL, now(), now())
  ON CONFLICT (name) WHERE parent_id IS NULL DO NOTHING
  RETURNING id, name
),
parents AS (
  SELECT id, name FROM roots
  UNION ALL
  SELECT id, name FROM incident_categories WHERE parent_id IS NULL
),
leaves (parent_name, name) AS (
  VALUES
    ('Infraestructura Vial', 'Baches y Hundimientos'),
    ('Infraestructura Vial', 'Semáforos Dañados'),
    ('Infraestructura Vial', 'Señalización Vial'),
    ('Infraestructura Vial', 'Alumbrado Público'),
    ('Servicios Básicos', 'Agua Potable'),
    ('Servicios Básicos', 'Alcantarillado'),
    ('Servicios Básicos', 'Recolección de Residuos'),
    ('Servicios Básicos', 'Red Eléctrica'),
    ('Seguridad Ciudadana', 'Robos y Hurtos'),
    ('Seguridad Ciudadana', 'Vandalismo'),
    ('Seguridad Ciudadana', 'Accidentes de Tránsito'),
    ('Medio Ambiente', 'Contaminación Ambiental'),
    ('Medio Ambiente', 'Tala de Árboles'),
    ('Medio Ambiente', 'Basureros Clandestinos'),
    ('Obras e Infraestructura', 'Construcciones Ilegales'),
    ('Obras e Infraestructura', 'Obras Abandonadas'),
    ('Obras e Infraestructura', 'Veredas y Aceras Deterioradas')
)
INSERT INTO incident_categories (id, name, parent_id, created_at, updated_at)
SELECT gen_random_uuid(), l.name, p.id, now(), now()
  FROM leaves l
  JOIN parents p ON p.name = l.parent_name
ON CONFLICT (name, parent_id) WHERE parent_id IS NOT NULL DO NOTHING;

COMMIT;
