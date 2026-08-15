# Tasks - Implementación RBAC y Refactorización

- [ ] T1 — Limpiar el arreglo `$recursoMapping` en `PermissionsSeeder.php` dejando solo excepciones con una sola palabra (ej. `'Opciones de Menú' => 'opciones'`) sin redundancias.
- [ ] T2 — Refactorizar `CheckResourcePermission.php` borrando el `$resourceMap` hardcodeado, y modificar `api.php` agregando `->names('...')` a cada recurso para que el middleware valide dinámicamente usando `$request->route()->getName()`.
- [ ] T3 — Modificar el backend para incluir la lista plana de permisos del usuario en la respuesta de autenticación/perfil (`/api/v1/me` o `/api/v1/login`). Cubre: R1.
- [ ] T4 — Crear el script utilitario `permissions.js` en el frontend con la función `hasPermission(recurso, accion)` y cargarlo en el layout principal. Cubre: R2, R3.
- [ ] T5 — Integrar `hasPermission` en la generación dinámica del menú lateral (`Sidebar`), omitiendo las opciones sin permiso `READ`. Cubre: R2.
- [ ] T6 — Aplicar `hasPermission` en los listados y formularios de al menos 3 módulos principales (ej. Usuarios, Roles, Incidencias) para ocultar botones de Creación/Edición/Eliminación. Cubre: R3.
- [ ] T7 — Añadir un interceptor en el cliente HTTP del frontend para mostrar un mensaje amigable cuando reciba un error 403 de la API. Cubre: R4.
- [ ] T8 — Asegurar que los tests del backend sigan pasando exitosamente después de limpiar el middleware y el seeder.
