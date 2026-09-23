-- 0064_fix_menu_display_order.sql
-- Fixes display_order sequence in menu_options. Root items should increment
-- by 10, sub-items within their parent by 1.
--
-- Current state: Departamentos, Auditoría de Acceso, Controles have
-- display_order in wrong sequence due to insert timing in 0060/0063.
--
-- Pattern (GESTIÓN group as example):
--   Root: 60, 70, 80, 90, 100, 110 (increment 10)
--   Sub-items under 60: 61, 62 (increment 1 within parent)
--   Sub-items under 70: 71, 72
--   Sub-items under 80: 81, 82
--   Sub-items under 90: 91, 92

BEGIN;

-- Fix root items in GESTIÓN group (parent_id = a0000000-0000-0000-0000-000000000002)
UPDATE menu_options SET display_order = 90
WHERE id = 'b0000000-0000-0000-0000-000000000012' AND name = 'Departamentos'
  AND parent_id = 'a0000000-0000-0000-0000-000000000002';

UPDATE menu_options SET display_order = 100
WHERE id = 'b0000000-0000-0000-0000-000000000013' AND name = 'Auditoría de Acceso'
  AND parent_id = 'a0000000-0000-0000-0000-000000000002';

UPDATE menu_options SET display_order = 110
WHERE id = 'b0000000-0000-0000-0000-000000000011' AND name = 'Controles'
  AND parent_id = 'a0000000-0000-0000-0000-000000000002';

-- Verify CATÁLOGOS group also ordered correctly (root: 120, 130)
-- Categorías: 120, children 121/122 ✓ (already correct)
-- Ubicaciones: 130, children 131/132 ✓ (already correct)

INSERT INTO schema_migrations (version, name, checksum) VALUES ('0064', '0064_fix_menu_display_order.sql', 'manual');

COMMIT;
