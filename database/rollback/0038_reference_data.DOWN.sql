-- 0038_reference_data.DOWN.sql
-- Rollback of 0038_reference_data.sql (T7.9.A).
--
-- Deletes only the 22 seeded categories, matched by name — never a
-- TRUNCATE. A deployment may already have user-created categories in this
-- table (created through the admin API) that must survive this rollback.
-- Leaves are deleted before roots so no FK from a leaf to a root is ever
-- left dangling mid-statement, though `parent_id` is `ON DELETE SET NULL`
-- (design.md D13) so the order is a safety habit, not a hard requirement.

BEGIN;

DELETE FROM incident_categories
 WHERE parent_id IS NOT NULL
   AND name IN (
     'Baches y Hundimientos', 'Semáforos Dañados', 'Señalización Vial', 'Alumbrado Público',
     'Agua Potable', 'Alcantarillado', 'Recolección de Residuos', 'Red Eléctrica',
     'Robos y Hurtos', 'Vandalismo', 'Accidentes de Tránsito',
     'Contaminación Ambiental', 'Tala de Árboles', 'Basureros Clandestinos',
     'Construcciones Ilegales', 'Obras Abandonadas', 'Veredas y Aceras Deterioradas'
   );

DELETE FROM incident_categories
 WHERE parent_id IS NULL
   AND name IN (
     'Infraestructura Vial', 'Servicios Básicos', 'Seguridad Ciudadana',
     'Medio Ambiente', 'Obras e Infraestructura'
   );

DROP INDEX IF EXISTS uq_incident_categories_child;
DROP INDEX IF EXISTS uq_incident_categories_root;

COMMIT;
