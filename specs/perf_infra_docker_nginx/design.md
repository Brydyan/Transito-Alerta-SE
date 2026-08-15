# Design para perf_infra_docker_nginx

## Archivos a modificar

- `nginx.conf`: Se añadirán las directivas de compresión GZIP (`gzip on`, `gzip_types`, `gzip_vary`) dentro del bloque `server` para comprimir las respuestas.
- `docker-compose.yml`: Se añadirá la propiedad `command` en el servicio `postgres` con los flags `-c shared_buffers=256MB` y `-c work_mem=16MB` (valores iniciales recomendados para PostGIS) para sobreescribir la configuración por defecto.

## Nuevas firmas

No se añaden nuevas clases ni métodos en el código de aplicación (capa de infraestructura únicamente).

## Excepciones añadidas o reutilizadas

No aplica manejo de excepciones al ser cambios puramente de infraestructura (archivos de configuración).

## Alternativas descartadas

1. **Uso de Brotli en lugar de GZIP para Nginx:** Se descartó porque habilitar compresión Brotli requiere compilar el módulo de terceros `ngx_brotli` en la imagen oficial `nginx:alpine` o usar imágenes no oficiales. GZIP ya viene soportado nativamente y es suficiente para cumplir con el R3 sin introducir complejidad extra en el Dockerfile de Nginx.
2. **Uso de un archivo de configuración `postgresql.conf` dedicado montado como volumen:** Se descartó porque manejar pocos parámetros (`shared_buffers`, `work_mem`) se puede lograr de forma concisa y más visible para todo el equipo directamente en `docker-compose.yml` a través del `command` del contenedor. Montar un archivo entero requeriría mantener a la par todos los demás parámetros por defecto de Postgres.
