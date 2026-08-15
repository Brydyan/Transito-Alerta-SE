# Design: Complete Backend Test Files under 50% Coverage

## 1. Target Files Identified (< 50% coverage)
A partir del análisis de Clover XML, los archivos objetivo son:

**Controllers & Requests:**
- `AuthController.php` (0%)
- `DireccionController.php` (29.83%)
- `MetricsController.php` (0%)
- `CheckPermission.php` (0%)
- `LoginRequest.php` (0%)

**Services:**
- `IncidentGroupingService.php` (46.15%)
- `IssueNotificationService.php` (0%)

**Jobs & Commands:**
- `CalculateCf.php`, `CalculateDd.php`, `CalculateTep.php`, `CalculateVco.php` (0%)
- `EtlRunCommand.php` (40%)
- `LoadSqaMetricsFromJsonJob.php` (0%)
- `SyncFactIncidenciasJob.php` (29.11%)
- `SyncPerformanceLogsJob.php` (22.22%)
- `LogPerformanceJob.php` (0%)

**Models:**
- `Institucion.php`, `Prioridad.php`, `RecursoIncidencia.php` (0%)
- `User.php` (47.37%)

## 2. Approach
Dada la cantidad de archivos, se priorizará el incremento de cobertura agrupándolos lógicamente:
1. **Modelos y Requests:** Son los más fáciles de testear. Crearemos tests unitarios simples.
2. **Servicios:** Tests unitarios utilizando mocks para las dependencias (DB, otros servicios).
3. **Controladores:** Tests de integración o funcionales (similares a los hechos en Feature 10) usando peticiones HTTP simuladas.
4. **Comandos y Jobs:** Tests que ejecuten los jobs o comandos y verifiquen el resultado en la BD o que se despachen correctamente.

## 3. Refactoring
Durante la implementación, si se encuentran clases como `DireccionController` o `SyncFactIncidenciasJob` con demasiadas responsabilidades o condicionales complejos, se aplicará refactoring ("divide y vencerás") para facilitar las pruebas.
