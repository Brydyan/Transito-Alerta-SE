# Design for refactor_backend_test_files_under_80

## 1. Enfoque de Pruebas

Paso primero: se han modificado archivos de negocio:

- modified: backend/api/app/Http/Controllers/DireccionController.php
- modified: backend/api/app/Http/Controllers/IncidenciaController.php
- modified: backend/api/app/Http/Middleware/CheckResourcePermission.php
- modified: backend/api/app/Services/IncidenciaService.php

El enfoque fue reducir la complejidad cognitiva que tenían algunas de sus funciones de manera que sean fáciles de leer y mantener, evitando alterar lógica de negocio existente.

Paso segundo: deben verificarse las pruebas para estos archivos.

Se ampliarán las pruebas unitarias y de integración para cubrir los flujos alternativos, ramas de error y condicionales (edge cases) que causan que la cobertura de estos archivos esté por debajo del 80%.

- **CheckResourcePermission:** Añadir pruebas para cada verbo HTTP no autorizado (CREATE, UPDATE, DELETE, READ) y para el estado de "usuario no autenticado".
- **RoleRequest / RoleService / PermissionService / Permiso / Role:** Completar las pruebas CRUD y de relaciones (roles <-> permisos <-> usuarios).
- **HistorialIncidencia / IncidenciaService:** Cubrir flujos de validación, transiciones de estado complejas y queries del historial.

## 2. Archivos a Modificar / Crear

- `backend/api/tests/Feature/Middleware/CheckResourcePermissionTest.php`
- `backend/api/tests/Feature/Requests/RoleRequestTest.php`
- `backend/api/tests/Feature/Models/HistorialIncidenciaModelTest.php`
- `backend/api/tests/Feature/Models/RoleModelTest.php`
- `backend/api/tests/Feature/Models/PermisoModelTest.php`
- `backend/api/tests/Feature/Services/RoleServiceTest.php`
- `backend/api/tests/Feature/Services/PermissionServiceTest.php`
- `backend/api/tests/Feature/Services/IncidenciaServiceTest.php`
