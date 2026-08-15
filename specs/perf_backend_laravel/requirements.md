# Requirements

## R1
MIENTRAS el sistema atiende peticiones en los endpoints de listado de incidencias y dashboard, el sistema DEBE utilizar Eager Loading (mediante `with()`) para cargar las relaciones, de manera que no se ejecuten consultas adicionales por cada registro (N+1).

## R2
MIENTRAS el sistema responde a solicitudes de catálogos estáticos, el sistema DEBE retornar los resultados desde un mecanismo de caché (Redis o File) para evitar consultas repetitivas a la base de datos.

## R3
MIENTRAS el sistema resuelve las consultas agregadas del esquema OLAP (métricas del dashboard), el sistema DEBE recuperar y almacenar dichos cálculos en caché (Redis o File) para reducir la carga de procesamiento en la base de datos.

## R4
CUANDO se ejecutan en consola los comandos de optimización para producción (`php artisan optimize`, `route:cache`, `config:cache`, `view:cache`), el sistema DEBE ejecutarlos correctamente, retornando un código de salida exitoso (0) sin generar errores que rompan la aplicación.

## R5
MIENTRAS la aplicación genera logs en su operación normal o es inspeccionada por herramientas de profiling, el sistema NO DEBE registrar la existencia de consultas N+1 activas.

## R6
MIENTRAS el sistema procesa o retorna listados masivos (ej. millones de registros), el sistema DEBE utilizar paginación basada en cursor (`cursorPaginate`) o límite estricto para NO exceder los límites de memoria de PHP.

## R7
MIENTRAS el sistema calcula métricas agregadas pesadas (dashboard), el sistema DEBE utilizar `Query Builder` (SQL sin hidratación de modelos Eloquent) para garantizar escalabilidad y menor consumo de memoria.

## R8
MIENTRAS el sistema ejecute consultas de Query Builder directo de alto rendimiento, el sistema DEBE encapsular dicha lógica en clases dedicadas (Patrón Query Object o Repositories), manteniendo los controladores limpios para preservar la máxima mantenibilidad.
