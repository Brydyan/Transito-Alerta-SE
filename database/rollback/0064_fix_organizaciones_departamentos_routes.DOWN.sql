-- 0064_fix_organizaciones_departamentos_routes.DOWN.sql
-- Revierte el fix: restaura las rutas originales de los seeds 0055/0060.

UPDATE menu_options
SET route = '/organizaciones'
WHERE id = 'b0000000-0000-0000-0000-000000000008'
  AND route = '/admin/organizaciones';

UPDATE menu_options
SET route = '/departamentos'
WHERE id = 'b0000000-0000-0000-0000-000000000012'
  AND route = '/admin/departamentos';