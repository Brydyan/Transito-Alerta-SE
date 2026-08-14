# Trazabilidad de Requisitos - perf_database_postgres

| Requisito | Test / Verificación |
| --- | --- |
| **R1**: Índices B-Tree en estado_id, categoria_id, created_at | Verificado por `test_incidencia_query_execution_plan_uses_index` que comprueba el uso de índices sobre estas columnas, y por la migración `2026_07_20_054907_add_performance_indexes_to_incidencias_table.php`. |
| **R2**: Índices GiST en geometría (PostGIS) | Verificado por la migración que añade el índice y por `test_gist_index_exists`. |
| **R3**: Paginación en listados masivos (simple/cursor) | Verificado por `test_incidencia_index_uses_cursor_paginate` (asegura estructura y ausencia de `total`). |
| **R4**: Consultas de filtro evitan Seq Scan | Verificado por `test_incidencia_query_execution_plan_uses_index` (estado_id, tipo_incidencia_id, created_at) y por `test_spatial_query_execution_plan` (búsquedas espaciales). |
