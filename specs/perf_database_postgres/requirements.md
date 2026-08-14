# Requirements para perf_database_postgres

## R1
El sistema DEBE incluir índices B-Tree en las columnas `estado_id`, `categoria_id` y `created_at` de la tabla de incidencias.

## R2
El sistema DEBE incluir índices GiST en las columnas de geometría y coordenadas de PostGIS en la tabla de incidencias.

## R3
CUANDO se solicitan los listados masivos de incidencias a través de la API, el sistema DEBE retornar la respuesta paginada sin incluir el conteo total de elementos (usando `simplePaginate` o `cursorPaginate`).

## R4
CUANDO se realiza una consulta filtrando por `estado_id`, `categoria_id`, `created_at` o coordenadas espaciales, el sistema DEBE utilizar los índices correspondientes en el plan de ejecución en la base de datos, evitando escaneos secuenciales completos (`Seq Scan`).
