-- 0058_fix_controles_route.DOWN.sql
-- Revierte el fix: restaura route a '/controles'.

UPDATE menu_options
SET route = '/controles'
WHERE id = 'b0000000-0000-0000-0000-000000000011'
  AND route = '/admin/controles';
