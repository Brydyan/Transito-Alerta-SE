# Plan de Escalado con Docker Swarm — Réplicas de Frontend y Backend

## Objetivo

Escalar `frontend` y `backend` horizontalmente con Docker Swarm, manteniendo
`db`, `redis` y `rustfs` como instancia única, sin romper la recolección de
métricas ni el reverse proxy.

## Hallazgo clave: `deploy.yml` ya escala, pero está desactualizado

`deploy.yml` es el stack file real de Swarm (`docker stack deploy -c deploy.yml
incidencias-stack`) y **ya tiene `replicas: 2`** tanto en `frontend` (línea 24)
como en `backend` (línea 48). O sea que el mecanismo de escalado no es el
problema — el problema es que `deploy.yml` se desincronizó de
`docker-compose.yml` (el archivo de dev) y le faltan piezas que importan
apenas corrés 2+ réplicas de backend:

| Presente en `docker-compose.yml` | Presente en `deploy.yml` |
|---|---|
| `rustfs` (storage S3) | ❌ falta |
| `prometheus`, `grafana`, `loki`, `promtail` | ❌ falta |
| `postgres_exporter`, `redis_exporter` | ❌ falta |
| stack de `sonarqube` | ❌ falta (correcto — herramienta standalone, está bien dejarlo afuera) |
| healthcheck en `backend`/`frontend` | ❌ falta en `deploy.yml` |
| `deploy.update_config` (rolling update) | ❌ falta |

## 1. Reverse proxy — no hace falta tocar nada

`nginx.conf:5-45` (horneado en la imagen de `frontend`) proxea `/api/`,
`/.well-known/mercure` y `/storage/` hacia `http://backend:8000` usando el
resolver interno de Docker (`127.0.0.11`, `valid=10s`) — resuelve por
request en vez de cachear al arranque. En Swarm, `backend` resuelve a la VIP
del service, que balancea automático entre todas las réplicas de `backend`.
Esto ya funciona correctamente con `replicas: 2+`. **Acá no hay nada que
cambiar.**

Una cosa para verificar cuando las réplicas estén corriendo: el endpoint SSE
de Mercure (`nginx.conf:22-34`, `proxy_buffering off`, `proxy_read_timeout
1d`) es una conexión de larga duración anclada a la réplica de backend que
tocó primero — eso está bien funcionalmente, solo significa que los clientes
SSE no se distribuyen parejo en el tiempo como sí pasa con requests cortos.

## 2. Scraping de métricas — necesita un fix

`ops/prometheus/prometheus.yml:6-9`:

```yaml
- job_name: 'backend'
  static_configs:
    - targets: ['backend:8000']
```

Esto apunta a la **VIP**, no a las tasks individuales. Con 2+ réplicas de
backend, cada scrape cae en una réplica random detrás de la VIP — Prometheus
termina con una serie temporal inconsistente por intervalo de scrape en vez
de una serie por réplica, lo cual arruina cualquier `rate()`/`increase()`
sobre un contador.

**Fix:** cambiar a service discovery por DNS contra `tasks.backend`, el
nombre DNS que expone Swarm y que devuelve un registro A por cada task
corriendo:

```yaml
- job_name: 'backend'
  dns_sd_configs:
    - names: ['tasks.backend']
      type: A
      port: 8000
  metrics_path: '/metrics'
  relabel_configs:
    - source_labels: [__address__]
      target_label: instance
```

El mismo razonamiento aplica al job `nginx` (`prometheus.yml:11-14`, target
`frontend:80`) en cuanto `frontend` también tenga múltiples réplicas —
cambiarlo a `tasks.frontend` también.

Los jobs de `postgres_exporter` y `redis_exporter` quedan sin tocar — `db` y
`redis` siguen siendo instancia única, así que `static_configs` sigue siendo
correcto ahí.

## 3. Agregar los servicios que faltan en `deploy.yml`

Portar `rustfs`, `prometheus`, `grafana`, `loki`, `promtail`,
`postgres_exporter` y `redis_exporter` a `deploy.yml` con
`deploy.replicas: 1` explícito (no están pensados para escalar). Dos
detalles específicos de Swarm:

- **`promtail`** monta `/var/run/docker.sock` (`docker-compose.yml:198`)
  para leer logs de contenedores — eso es por nodo. En Swarm tiene que
  correr como `deploy.mode: global` (una task por nodo), no con un número
  fijo de réplicas, o solo va a ver logs del único nodo donde le toque
  caer.
- **`rustfs`** usa un volumen nombrado (`rustfs_data`) para storage de
  objetos. Los volúmenes nombrados en Swarm son locales al nodo donde cae
  la task. **N/A acá** — confirmado Swarm de un solo nodo (un VPS), no
  existe otro nodo donde una task reprogramada pueda caer; no hace falta
  `placement.constraints`. Revisar solo si en algún momento se suma un
  segundo nodo al cluster.

## 4. Agregar healthchecks + configuración de rolling update para `frontend`/`backend`

`deploy.yml` hoy solo tiene healthchecks en `db`/`redis`. Sin uno en
`backend`/`frontend`, Swarm no puede saber que una task está unhealthy y
sigue enrutando tráfico hacia ella. Agregar:

```yaml
backend:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
    interval: 10s
    timeout: 5s
    retries: 5
  deploy:
    replicas: 2
    update_config:
      parallelism: 1
      delay: 10s
      order: start-first
      failure_action: rollback
    restart_policy:
      condition: any
```

`order: start-first` + `parallelism: 1` da deploys rolling sin downtime:
Swarm arranca la task nueva, espera a que esté healthy, y recién ahí mata la
vieja — una réplica a la vez. Hacer lo mismo con `frontend` (healthcheck
contra `/` o `/nginx_status`).

## 5. `depends_on` es un no-op en Swarm — solo informativo

`deploy.yml:19-20,42-44` usan `depends_on`, que `docker stack deploy` ignora
por completo (sin espera basada en health, a diferencia del
`condition: service_healthy` de Compose). No bloquea nada si la app ya
reintenta la conexión a DB/Redis al arrancar — solo no confiar en
`depends_on` para el orden de arranque una vez que esto es un stack en vez
de un `docker-compose up`.

## Orden de rollout

1. Arreglar `ops/prometheus/prometheus.yml` (`dns_sd_configs` para `backend`/`frontend`) — sin riesgo de deploy.
2. Agregar `rustfs` + servicios de observability a `deploy.yml` con `replicas: 1`.
3. Agregar healthchecks + `update_config` a `backend`/`frontend` en `deploy.yml`.
4. `docker stack deploy -c deploy.yml incidencias-stack` y confirmar en Grafana que `backend` ahora muestra múltiples valores de label `instance` bajo carga.

## Resuelto: Swarm de un solo nodo

Confirmado, una sola máquina física. `placement.constraints` no hace falta —
los volúmenes de `db`/`redis`/`rustfs` siempre quedan en el único nodo que
existe.
