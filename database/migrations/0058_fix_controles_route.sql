-- 0058_fix_controles_route.sql
-- Fix: la migración 0057 sembró route='/controles', pero los ítems bajo
-- ADMIN usan el prefijo /admin/... (ver 0055: /admin/users, /admin/roles).
-- El frontend (MenuService.formatRoutes) antepone /app → '/controles'
-- se convierte en '/app/controles' (no existe, cae en comodín **).
-- Corrige a '/admin/controles' para que la URL resultante sea
-- '/app/admin/controles' (ruta hija de admin en app.routes.ts:162).
--
-- MANUAL EXECUTION ONLY — ver 0001_initial_schema.sql header.

UPDATE menu_options
SET route = '/admin/controles'
WHERE id = 'b0000000-0000-0000-0000-000000000011'
  AND route = '/controles';
