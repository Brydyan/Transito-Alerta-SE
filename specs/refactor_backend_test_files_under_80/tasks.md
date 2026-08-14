# Tasks for refactor_backend_test_files_under_80

## 0. Ejecutar la cobertura de los archivos nuevos modificados

- [ ] T0.1 — Ejecutar la cobertura de `DireccionController.php` y verificar que alcanza más del 95%. Cubre: R0.1.
- [ ] T0.2 — Ejecutar la cobertura de `IncidenciaController.php` y verificar que alcanza más del 95%. Cubre: R0.2.
- [ ] T0.3 — Ejecutar la cobertura de `CheckResourcePermission.php` y verificar que alcanza más del 95%. Cubre: R0.3.
- [ ] T0.4 — Ejecutar la cobertura de `IncidenciaService.php` y verificar que alcanza más del 95%. Cubre: R0.4.

## 1. Cobertura de Middlewares y Requests

- [x] T1 — Refactorizar y probar `CheckResourcePermission` para alcanzar > 95% de cobertura. Cubre: R1, R9.
- [x] T2 — Refactorizar y probar `RoleRequest` para alcanzar > 95% de cobertura. Cubre: R2, R9.

## 2. Cobertura de Modelos

- [x] T3 — Refactorizar y probar `HistorialIncidencia` para alcanzar > 95% de cobertura. Cubre: R3, R9.
- [x] T4 — Refactorizar y probar `Permiso` y `Role` para alcanzar > 95% de cobertura. Cubre: R4, R5, R9.
- [x] T5 — Refactorizar y probar `PermissionService` para alcanzar > 95% de cobertura. Cubre: R6, R9.
- [x] T6 — Refactorizar y probar `RoleService` para alcanzar > 95% de cobertura. Cubre: R7, R9.
- [x] T7 — Refactorizar y probar `IncidenciaService` para alcanzar > 95% de cobertura. Cubre: R8, R9.
- [x] T8 — Ejecutar la cobertura y verificar que los archivos mencionados alcanzan más del 95%. Cubre: R1-R8.
