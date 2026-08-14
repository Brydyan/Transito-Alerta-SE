# Requirements para perf_infra_docker_nginx

## R1
MIENTRAS el servidor Nginx procese respuestas para endpoints de la API (JSON) o devuelva archivos estáticos (CSS, JS, HTML, SVG), el sistema DEBE aplicar compresión de datos utilizando GZIP.

## R2
CUANDO el contenedor `postgres` se inicie a través de Docker Compose, el sistema DEBE aplicar configuraciones de memoria ajustadas (incremento de `shared_buffers` y `work_mem`) específicas para optimizar el rendimiento de operaciones PostGIS.

## R3
CUANDO se midan los tiempos de respuesta de los endpoints GET bajo condiciones normales de red, el sistema DEBE registrar una latencia promedio global inferior a 250 milisegundos.
