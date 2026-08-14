# Tasks para perf_infra_docker_nginx

- [x] T1 — Actualizar `nginx.conf` añadiendo la configuración de GZIP (activación, tipos MIME soportados, compresión mínima) en el bloque `server`. Cubre: R1, R3.
- [x] T2 — Modificar el archivo `docker-compose.yml` (y sus variantes prod), añadiendo al servicio `postgres` la instrucción `command: postgres -c shared_buffers=256MB -c work_mem=16MB`. Cubre: R2, R3.
