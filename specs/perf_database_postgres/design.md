# Design de perf_database_postgres

## Archivos a modificar / crear
- `backend/api/database/migrations/*_add_performance_indexes_to_incidencias_table.php` (nueva migración).
- `backend/api/app/Http/Controllers/IncidenciaController.php` (o la clase que maneje el listado de incidencias).
- `backend/api/tests/Feature/IncidenciaPerformanceTest.php` (o test equivalente para validar la paginación y plan de ejecución).

## Firmas y funciones
- **Migraciones:** Nueva clase de migración para añadir `$table->index()` a las columnas B-Tree (`estado_id`, `categoria_id`, `created_at`) y `$table->spatialIndex()` a la columna de geometría.
- **Paginación:** Reemplazo de `$query->paginate(...)` por `$query->simplePaginate(...)` (o equivalente) en el listado masivo para omitir el conteo.

## Excepciones
- Ninguna excepción nueva del dominio es requerida. Se mantendrán los manejos de error actuales si fallan consultas (ej. `QueryException`).

## Alternativas descartadas
- **Crear índices compuestos (ej. `[estado_id, categoria_id]`) en lugar de simples.**
  - *Justificación:* Los filtros aplicados en listados de incidencias son variables y frecuentemente opcionales. Crear múltiples índices compuestos multiplicaría el tamaño en disco y el impacto en escrituras. PostgreSQL puede aplicar *Bitmap Index Scans* sobre índices simples separados y combinarlos dinámicamente si es necesario.
- **Evitar tests automatizados del plan de ejecución `EXPLAIN`.**
  - *Justificación:* En bases de datos de pruebas (como SQLite), la salida de `EXPLAIN` es distinta y no soporta índices GiST espaciales, pero como el proyecto define Docker con PostgreSQL/PostGIS (y el requirement estipula usar `EXPLAIN`), es necesario ejecutar el test contra PostgreSQL (o emularlo lo mejor posible) buscando evitar el nodo `Seq Scan`. Se prioriza validarlo en test de feature.
