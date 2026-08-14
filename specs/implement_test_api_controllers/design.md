# Design para implement_test_api_controllers

## Archivos a crear o modificar
Se crearán o actualizarán archivos de prueba dentro de `backend/api/tests/Feature/` (pruebas de integración).
Dado que ya existen algunas pruebas (ej. `CatalogoTest`, `AuthTest`), se crearán tests para los controladores ligeros (<= 150 líneas) que aún no tengan pruebas completas.

Controladores objetivo identificados (<= 150 líneas):
- `CategoriaIncidenciaController` -> `CategoriaIncidenciaTest.php`
- `InstitucionController` -> `InstitucionTest.php`
- `PaisController` -> `PaisTest.php`
- `PermisoController` -> `PermisoTest.php`
- `PrioridadController` -> `PrioridadTest.php`
- `RoleController` -> `RoleTest.php`
- `TerritorioController` -> `TerritorioTest.php`
- `UserController` -> `UserTest.php`
- `UserMenuController` -> `UserMenuTest.php`
- `NotificationController` -> `NotificationTest.php`
- `TrpController` -> `TrpTest.php`
- `DashboardController` -> `DashboardTest.php` (Ya existente, se agregará solo si falta cobertura específica requerida)
- `CatalogoController` -> `CatalogoTest.php` (Ya existente, se agregará solo si falta cobertura específica requerida)
- `OpcionMenuController` -> `OpcionMenuTest.php` (Ya existente, se agregará solo si falta cobertura específica requerida)
- `AuthController` -> `AuthTest.php` (Ya existente, se agregará solo si falta cobertura específica requerida)

## Firmas y funciones nuevas
- Se añadirán clases que extiendan de `Tests\TestCase` utilizando el trait `RefreshDatabase`.
- En el `setUp` de cada test se deben crear datos base (usuarios, roles, y entidades del catálogo necesarias para relaciones).
- Se añadirán métodos como `test_index_returns_...`, `test_store_validates_data`, `test_show_returns_...`, etc.

## Decisiones técnicas y alternativas descartadas
- **Alternativa descartada:** Usar SQLite en memoria para tests.
  - **Motivo de descarte:** La aplicación utiliza extensiones de PostgreSQL (PostGIS) y maneja esquemas múltiples (como `metrics`). SQLite no soporta estas características y haría que las pruebas salten (skipped) o fallen, tal como lo indicó el equipo.
- **Alternativa descartada:** Crear pruebas unitarias aisladas mockeando todo.
  - **Motivo de descarte:** Es preferible realizar pruebas de Feature (integración) que llamen al endpoint HTTP y verifiquen Request/Response real y la interacción con la base de datos, porque aportan mayor confianza en la capa API.
