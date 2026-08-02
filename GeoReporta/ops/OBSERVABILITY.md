# Observability Stack — Prometheus + Grafana + Loki

## Stack Overview

```
┌─────────────┐     ┌──────────────┐     ┌──────────┐
│   Backend   │────▶│  Prometheus  │◀────│  Grafana │
│  /metrics   │     │  :9090       │     │  :3001   │
└─────────────┘     └──────────────┘     └──────────┘
┌─────────────┐     ┌──────────────┐
│   Backend   │────▶│   Promtail   │────▶│   Loki   │
│  (logs)     │     │  :9080       │     │  :3100   │
└─────────────┘     └──────────────┘     └──────────┘
```

## Services (docker-compose)

| Service | Port | Purpose |
|---------|------|---------|
| prometheus | 9090 | Metrics store & scraper |
| grafana | 3001 | Dashboards UI |
| loki | 3100 | Log store |
| promtail | 9080 | Log shipper (Docker → Loki) |
| postgres_exporter | 9187 | PG metrics |
| redis_exporter | 9121 | Redis metrics |

## Metrics (Prometheus)

### HTTP Request Metrics (`app_http_`)

| Metric | Type | Labels |
|--------|------|--------|
| `app_http_requests_total` | Counter | `method`, `route`, `status` |
| `app_http_request_duration_seconds` | Histogram | `method`, `route` (buckets: 1ms–10s) |
| `app_http_requests_in_progress` | Gauge | `method`, `route` |

Registered in `app/Http/Middleware/InstrumentHttpRequests.php` via raw `promphp/prometheus_client_php` CollectorRegistry (not spatie facade).

### Business Metrics (`app_`)

| Metric | Type | Labels |
|--------|------|--------|
| `app_users_active_total` | Gauge | — |
| `app_incidents_by_status` | Gauge | `status` |
| `app_incidents_total` | Gauge | — |

Registered in `app/Providers/PrometheusServiceProvider.php` via spatie facade.

## Logs (Loki)

Labels disponibles:

| Label | Ejemplo |
|-------|---------|
| `service` | `backend`, `frontend`, `db`, `redis`, `grafana`, `loki` |
| `container` | `/sistema-incidencias-georreferenciadas-backend-1` |
| `stream` | `stdout`, `stderr` |
| `job` | `varlogs` (sistema) |

---

## Query Variants para Loki

```logql
{service="backend"}
```

```logql
{service="backend"} |= "error"
```

```logql
{service="backend"} |= "ERROR" or "exception"
```

```logql
{service="backend"} | json
```

```logql
{service="backend"} | json | level_name="ERROR"
```

```logql
{service="backend"} |= "api/incidents"
```

```logql
{service="backend"} | json | method="POST"
```

```logql
{service="backend"} |= "status=401"
```

```logql
{service="backend"} |= "duration"
```

```logql
{service="backend"} | logfmt | duration > 1000
```

```logql
rate({service="backend"} |= "error" [5m])
```

```logql
sum by (stream) (rate({service="backend"}[5m]))
```

```logql
{service=~"backend|frontend"} |= "error"
```

---

## Query Variants para Prometheus

### Tráfico

```promql
# Requests por segundo (total)
rate(app_http_requests_total[5m])

# Requests por segundo por ruta
topk(10, sum by (route) (rate(app_http_requests_total[5m])))

# Requests por segundo por status code
sum by (status) (rate(app_http_requests_total[5m]))

# Tasa de error (5xx + 4xx / total)
sum(rate(app_http_requests_total{status=~"5.."}[5m])) / sum(rate(app_http_requests_total[5m])) * 100
```

### Latencia

```promql
# P95 latencia
histogram_quantile(0.95, rate(app_http_request_duration_seconds_bucket[5m]))

# P99 por ruta
histogram_quantile(0.99, sum by (le, route) (rate(app_http_request_duration_seconds_bucket[5m])))

# Latencia promedio por ruta (top 5 más lentas)
topk(5, avg by (route) (
  rate(app_http_request_duration_seconds_sum[5m]) /
  rate(app_http_request_duration_seconds_count[5m])
))
```

### Saturación

```promql
# Requests en progreso ahora
app_http_requests_in_progress

# Requests en progreso por ruta
sum by (route) (app_http_requests_in_progress)
```

### Negocio

```promql
# Usuarios activos
app_users_active_total

# Incidencias por estado
app_incidents_by_status

# Total de incidencias
app_incidents_total

# Distribución % de incidencias por estado
sum by (status) (app_incidents_by_status) / ignoring(status) (sum(app_incidents_by_status)) * 100
```

### Sistema

```promql
# Uptime del backend (siempre que haya requests)
changes(app_http_requests_total[1m]) > 0

# Conexiones PostgreSQL activas
pg_stat_activity_count

# Uso de memoria Redis
redis_memory_used_bytes / redis_memory_max_bytes * 100
```

---

## Errores y Soluciones

### 1. Clase Prometheus no encontrada

**Error:** `Class "Spatie\Prometheus\Facades\Prometheus" not found`

**Causa:** `spatie/laravel-prometheus` estaba en composer.json pero no instalado en la imagen (se instalaba solo en producción vía `composer install --no-dev`).

**Solución:** Ejecutar `composer require spatie/laravel-prometheus` desde el host para que se instale localmente y quede en `vendor/`.

### 2. API incompatible con spatie facade

**Error:** `Call to undefined method ...->helpText()` / `Call to undefined method ...->labels()`

**Causa:** `spatie/laravel-prometheus` facade y `promphp/prometheus_client_php` raw CollectorRegistry tienen APIs distintas (addCounter vs addGauge, argumentos posicionales vs arrays). El middleware usaba el facade pero el CollectorRegistry registrado como singleton usaba la API raw.

**Solución:** Separar responsabilidades:
  - Middleware HTTP → usa `promphp/prometheus_client_php` CollectorRegistry directamente (API raw) para registrar y actualizar counter/gauge/histogram
  - Business metrics → usa spatie facade porque es más declarativa y no necesita labels dinámicas

### 3. Counter y Histogram nunca aparecen en /metrics

**Error:** `app_http_requests_total` y `app_http_request_duration_seconds` no aparecen en `/metrics` aunque se escriben a Redis. Solo `app_http_requests_in_progress` (gauge) se ve.

**Causa:** `Spatie\Prometheus\Adapters\LaravelCacheAdapter::collect()` llama a `$this->fetch($store)` pero **descarta el valor retornado**. Fetch trae los datos de Redis, pero nunca se asignan a los arrays in-memory (`$this->counters`, `$this->histograms`). Las gauges sí funcionan porque spatie facade hace un `updateGauge()` que también carga de Redis antes del render.

**Solución:** Crear `App\Prometheus\Adapters\FixedLaravelCacheAdapter` que extiende `LaravelCacheAdapter` y sobreescribe `collect()`:

```php
class FixedLaravelCacheAdapter extends LaravelCacheAdapter
{
    public function collect(bool $sortMetrics = true): array
    {
        $this->gauges = $this->fetch(Gauge::TYPE);
        $this->counters = $this->fetch(Counter::TYPE);
        $this->histograms = $this->fetch(Histogram::TYPE);
        $this->summaries = $this->fetch(Summary::TYPE);

        $metrics = $this->internalCollect($this->counters, $sortMetrics);
        $metrics = array_merge($metrics, $this->internalCollect($this->gauges, $sortMetrics));
        $metrics = array_merge($metrics, $this->collectHistograms());
        $metrics = array_merge($metrics, $this->collectSummaries());

        return $metrics;
    }
}
```

Luego en `PrometheusServiceProvider`:

```php
$adapter = $store
    ? new FixedLaravelCacheAdapter(Cache::store($store))
    : new InMemory;
```

### 4. nginx stub_status devuelve 403

**Error:** Prometheus scrape target `http://frontend/nginx_status` retorna `HTTP 403 Forbidden`.

**Causa:** `nginx.conf` tenía `allow 127.0.0.1; deny all;` — solo permitía conexiones locales, pero Prometheus conecta desde la red Docker.

**Solución:** Eliminar la restricción IP del location `/nginx_status` (está en red interna Docker).

### 5. Promtail no descubre contenedores Docker

**Error:** `docker_sd_configs` no muestra targets de ningún contenedor. Solo aparecen logs del sistema (`varlogs`). Loki responde con labels `filename` y `job` pero no `container` ni `service`.

**Causa:** Dos problemas:

  1. **Permisos del socket Docker.** La imagen `grafana/promtail` corre como usuario no-root y no puede leer `/var/run/docker.sock`.

  **Solución:** Agregar `user: root` al servicio promtail en `docker-compose.yml`.

  2. **Ruta de config incorrecta.** La imagen de Promtail usa por defecto `-config.file=/etc/promtail/config.yml`. Nuestro archivo se montaba en `/etc/promtail/promtail.yml`, así que nunca se cargaba. La imagen cargaba su `config.yml` por defecto (solo con `varlogs`).

  **Solución:** Cambiar el mount de:

  ```yaml
  - ./ops/promtail/promtail.yml:/etc/promtail/promtail.yml
  ```

  a:

  ```yaml
  - ./ops/promtail/promtail.yml:/etc/promtail/config.yml
  ```

---

## Archivos Relevantes

| Archivo | Propósito |
|---------|-----------|
| `ops/prometheus/prometheus.yml` | Config scrape targets |
| `ops/grafana/provisioning/datasources/datasources.yml` | Datasources (Prometheus, Loki) |
| `ops/loki/loki.yml` | Config Loki |
| `ops/promtail/promtail.yml` | Config Promtail (Docker SD) |
| `nginx.conf` | stub_status + proxy reverso |
| `app/Providers/PrometheusServiceProvider.php` | Registry singleton + métricas de negocio |
| `app/Http/Middleware/InstrumentHttpRequests.php` | Métricas HTTP (counter, histogram, gauge) |
| `app/Prometheus/Adapters/FixedLaravelCacheAdapter.php` | Fix collect() de LaravelCacheAdapter |
| `config/prometheus.php` | spatie/laravel-prometheus config |
