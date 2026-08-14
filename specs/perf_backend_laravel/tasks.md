# Tasks

- [x] T1 — Modificar el endpoint de listado en los controladores de incidencias para incluir Eager Loading (`with()`) en las relaciones, resolviendo las consultas N+1. Cubre: R1, R5.
- [x] T2 — Modificar el endpoint del dashboard para incluir Eager Loading en los modelos relacionados requeridos. Cubre: R1, R5.
- [x] T3 — Escribir un test (`tests/Feature/IncidenciaPerformanceTest.php`) que afirme que el conteo de consultas a BD no escala con el número de incidencias (usando assertions de DB de Laravel). Cubre: R1, R5.
- [x] T4 — Envolver las consultas a catálogos estáticos con `Cache::remember()` o `Cache::rememberForever()` en los controladores/modelos correspondientes. Cubre: R2.
- [x] T5 — Envolver las consultas OLAP/métricas del dashboard con `Cache::remember()` definiendo un tiempo de expiración adecuado (TTL). Cubre: R3.
- [x] T6 — Escribir un test (`tests/Feature/CachePerformanceTest.php`) que mockee la base de datos o la fachada de caché y asegure que las subsiguientes llamadas a catálogos y métricas no disparan queries repetidas. Cubre: R2, R3.
- [x] T7 — Revisar los archivos de rutas (`routes/*.php`) y configuraciones (`config/*.php`) para refactorizar cualquier closure que impida el uso de `route:cache` y `config:cache`. Cubre: R4.
- [x] T8 — Escribir un test (`tests/Feature/ArtisanOptimizeTest.php`) que ejecute programáticamente los comandos `optimize`, `route:cache`, `config:cache` y `view:cache`, verificando que devuelvan código 0 sin lanzar excepciones. Cubre: R4.
- [x] T9 — Refactorizar listados masivos en la API para forzar el uso de `cursorPaginate()` (o límite máximo), previniendo saturación de memoria. Cubre: R6.
- [x] T10 — Crear clases dedicadas bajo el patrón Query Object (ej. `App\Queries\DashboardMetricsQuery`) para encapsular toda consulta construida con `DB::table()`. Cubre: R8.
- [x] T11 — Refactorizar el controlador del dashboard para que delegue la obtención de datos a los Query Objects y la integre con `Cache::remember()`, asegurando código limpio. Cubre: R3, R7, R8.
