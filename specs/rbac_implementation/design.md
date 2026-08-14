# Design - Implementación RBAC y Refactorización

## Contexto y Arquitectura

El proyecto ya cuenta con una tabla de roles y permisos. El objetivo de este diseño es extender la seguridad al frontend y purgar las malas prácticas identificadas en el backend (hardcodeos de recursos).

## Cambios en el Backend
1. **Refactorización del Middleware (Cero Hardcodeos)**: 
   - Se eliminará por completo el arreglo `$resourceMap` de `CheckResourcePermission.php`.
   - Para no depender de mapeos ni traducciones manuales en el middleware, **le daremos nombres personalizados a las rutas en `api.php`** (por ejemplo: `->names('opciones')`, `->names('categorias')`).
   - De esta manera, el middleware extraerá la primera parte del nombre de la ruta (ej. de `opciones.index` extraerá `opciones`) y lo usará para verificar permisos directamente, sin importar cómo se escriba la URL.
2. **Limpieza del PermissionsSeeder**:
   - El seeder dejará las excepciones como: `'Opciones de Menú' => 'opciones'` y `'Categorías de Incidencias' => 'categorias'`.
   - Eliminaremos los mapeos redundantes como `'Usuarios' => 'usuarios'`, ya que el código existente lo deduce automáticamente.
3. **Exposición de Permisos**:
   - Se modificará el endpoint de `/api/v1/me` (o similar) para que en su payload se adjunte un arreglo plano con los permisos del usuario activo. Por ejemplo: `['READ users', 'CREATE users', 'READ menu-options']`.

## Cambios en el Frontend
- **Almacenamiento de Estado**: El `authService.js` almacenará el arreglo de permisos en memoria (o sessionStorage).
- **Utilidad de Permisos**: Se creará un helper o script `public/js/utils/permissions.js` con una función `hasPermission(recurso, accion)` que el frontend pueda consultar.
- **Renderizado Condicional (UI)**: 
  - El Sidebar usará `hasPermission` durante su renderizado para omitir los enlaces prohibidos.
  - Los componentes CRUD inyectarán los botones de Nuevo, Editar y Eliminar condicionados por esta misma utilidad.
- **Manejo de Errores (403)**: El cliente HTTP interceptará respuestas con estatus 403 y mostrará una notificación visual al usuario (p. ej. Toast / SweetAlert).
