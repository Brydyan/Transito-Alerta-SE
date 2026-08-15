# Requirements for refactor_backend_test_files_under_80

## 0. Revisar las pruebas de los archivos nuevos modificados

- **R0.1:** While ejecutando las pruebas de backend, the system shall report > 95% de cobertura para `DireccionController.php`.
- **R0.2:** While ejecutando las pruebas de backend, the system shall report > 95% de cobertura para `IncidenciaController.php`.
- **R0.3:** While ejecutando las pruebas de backend, the system shall report > 95% de cobertura para `CheckResourcePermission.php`.
- **R0.4:** While ejecutando las pruebas de backend, the system shall report > 95% de cobertura para `IncidenciaService.php`.

## 1. Cobertura de Middlewares y Requests

- **R1:** While ejecutando las pruebas de backend, the system shall report > 95% de cobertura para `CheckResourcePermission`.
- **R2:** While ejecutando las pruebas de backend, the system shall report > 95% de cobertura para `RoleRequest`.

## 2. Cobertura de Modelos

- **R3:** While ejecutando las pruebas de backend, the system shall report > 95% de cobertura para `HistorialIncidencia`.
- **R4:** While ejecutando las pruebas de backend, the system shall report > 95% de cobertura para `Permiso`.
- **R5:** While ejecutando las pruebas de backend, the system shall report > 95% de cobertura para `Role`.

## 3. Cobertura de Servicios

- **R6:** While ejecutando las pruebas de backend, the system shall report > 95% de cobertura para `PermissionService`.
- **R7:** While ejecutando las pruebas de backend, the system shall report > 95% de cobertura para `RoleService`.
- **R8:** While ejecutando las pruebas de backend, the system shall report > 95% de cobertura para `IncidenciaService`.

## 4. Refactorización (Deuda Técnica)

- **R9:** Where haya funciones con demasiadas líneas o code smells en los archivos mencionados, the system shall descomponerlas aplicando divide y vencerás para mantener la mantenibilidad.
