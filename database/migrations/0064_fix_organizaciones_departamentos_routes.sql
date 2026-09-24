-- 0064_fix_organizaciones_departamentos_routes.sql
-- Fix: los seeds 0055/0060 sembraron las opciones de menú con las rutas
-- originales `/organizaciones` y `/departamentos`, pero esos ítems viven
-- bajo ADMIN y usan el prefijo `/admin/...` (mismo patrón que 0055:
-- `/admin/users`, `/admin/roles`).
-- El frontend (MenuService.formatRoutes) antepone `/app` a la ruta del
-- backend → `/organizaciones` se convierte en `/app/organizaciones`
-- (inexistente, cae en el comodín `**` y muestra la página de error).
-- Corrige a `/admin/organizaciones` y `/admin/departamentos` para que la
-- URL final sea `/app/admin/organizaciones` y `/app/admin/departamentos`
-- (rutas hijas de `admin` en app.routes.ts:204/236).
--
-- Idempotente en la práctica: el WHERE limita el UPDATE a las filas que
-- aún tengan la ruta vieja; re-ejecutar es no-op.
--
-- MANUAL EXECUTION ONLY — ver 0001_initial_schema.sql header.
-- Requiere invalidar cache `menu:v1:*` tras aplicar.

UPDATE menu_options
SET route = '/admin/organizaciones'
WHERE id = 'b0000000-0000-0000-0000-000000000008'
  AND route = '/organizaciones';

UPDATE menu_options
SET route = '/admin/departamentos'
WHERE id = 'b0000000-0000-0000-0000-000000000012'
  AND route = '/departamentos';