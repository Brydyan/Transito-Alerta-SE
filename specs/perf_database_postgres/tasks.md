# Tasks para perf_database_postgres

- [x] T1 — Crear migración `add_performance_indexes_to_incidencias_table.php` en `backend/api/database/migrations/` e incluir la creación de índices B-Tree (`estado_id`, `categoria_id`, `created_at`) y GiST para la geometría espacial de PostGIS. Cubre: R1, R2.
- [x] T2 — Modificar el controlador de listado masivo (ej. `IncidenciaController@index` u otro pertinente en `backend/api/app/Http/Controllers/`) para cambiar la llamada de `paginate()` a `simplePaginate()` (o `cursorPaginate()`). Cubre: R3.
- [x] T3 — Escribir test (ej. `tests/Feature/IncidenciaPerformanceTest.php`) que verifique que el endpoint de listado masivo devuelve una estructura de paginación simple (sin el conteo total `total`). Cubre: R3.
- [x] T4 — Escribir test en `tests/Feature/IncidenciaPerformanceTest.php` que ejecute una consulta con filtros (`estado_id`, etc.) anteponiendo `EXPLAIN` (vía `DB::select()`) y verifique que el plan de ejecución incluye el uso de un índice (ej. que no contenga `Seq Scan` en la tabla incidencias). Cubre: R4.
