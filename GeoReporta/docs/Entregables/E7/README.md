# E7: Stress Testing & Calidad Operacional

## 📋 Entregable 7

Informe de evaluación del rendimiento y calidad operacional del Sistema de Incidencias Georreferenciadas.

## 📁 Estructura

```
E7/
├── ENTREGA_E7_INFORME_RENDIMIENTO.md   # Reporte principal (5-7 páginas)
├── DASHBOARD_E7.html                   # Dashboard HTML con resultados
├── run-stress-tests.sh                 # Script para ejecutar pruebas
└── README.md                           # Este archivo

ops/dashboards-k6/k6.json              # Dashboard Grafana para k6 (InfluxDB)
ops/dashboards/laravel-app.json        # Dashboard Grafana para Laravel (Prometheus)
```

## 📊 Dashboards Grafana Pre-configurados

### Dashboard k6 (`ops/dashboards-k6/k6.json`)

Métricas de load testing en tiempo real:

| Panel | Métrica | Datasource |
|-------|---------|-----------|
| Requests/sec | Throughput total | InfluxDB |
| Latency p95/p99 | Percentiles de latencia | InfluxDB |
| Error rate | Porcentaje de errores | InfluxDB |
| Virtual Users | VUs activos | InfluxDB |

### Dashboard Laravel (`ops/dashboards/laravel-app.json`)

Métricas de aplicación:

| Panel | Métrica | Datasource |
|-------|---------|-----------|
| Usuarios activos | `app_users_active_total` | Prometheus |
| Incidencias totales | `app_incidents_total` | Prometheus |
| Incidencias por estado | `app_incidents_by_status` | Prometheus |
| Logs recientes | Containers (Loki) | Loki |

## 🚀 Ejecución Rápida

```bash
# Asegúrate que el backend esté corriendo
cd backend && php artisan serve

# Ejecutar suite completa
bash docs/E7/run-stress-tests.sh all

# O ejecutar escenarios individuales
bash docs/E7/run-stress-tests.sh smoke
bash docs/E7/run-stress-tests.sh read
bash docs/E7/run-stress-tests.sh write
```

## 📈 Integración con Grafana + InfluxDB

### 1. Iniciar servicios (Docker Compose)

```bash
# docker-compose.monitoring.yml o similar
docker-compose up -d influxdb grafana
```

### 2. Ejecutar k6 con output a InfluxDB

```bash
k6 run perf/scripts/incidents-read.js \
  --out influxdb=http://localhost:8086/k6
```

### 3. Importar dashboards en Grafana

1. Abrir Grafana: http://localhost:3000
2. Dashboards → Import
3. Cargar `ops/dashboards-k6/k6.json`
4. Seleccionar datasource: InfluxDB (k6-influxdb)

## 📊 Escenarios de Prueba

| Escenario | VUs | Duración | Objetivo p(95) |
|-----------|-----|----------|----------------|
| Smoke Test | 1 | 1 min | < 200ms |
| Read-Heavy | 50 | 3.5 min | < 500ms |
| Write-Heavy | 20 | 2 min | < 1000ms |
| Mixed 50/50 | 25 | 3 min | < 800ms |

## 📈 Dashboard HTML

Abrir `DASHBOARD_E7.html` en un navegador para visualizar:
- Resumen de resultados por escenario
- Bottlenecks identificados
- Integración con Grafana
- Comparación con SLA del Hito 1

## 🔧 Scripts k6

Los scripts de prueba están en `perf/scripts/`:

- `smoke.js` - Smoke test básico
- `incidents-read.js` - Prueba de lectura (feed, listados)
- `incidents-write.js` - Prueba de escritura (creación)
- `load-test-complete.js` - Suite completa

## 📝 Métricas SLA (Hito 1)

| Métrica | Objetivo | Resultado |
|---------|----------|-----------|
| Disponibilidad | ≥ 99.5% | ✅ 99.7% |
| Latencia p(95) | < 500ms | ✅ 412ms |
| Throughput | ≥ 50 req/s | ✅ 245 req/s |
| Tasa error | < 1% | ✅ 0.9% |

## 📚 Referencias

- [k6 Documentation](https://k6.io/docs/)
- [Grafana Dashboards](https://grafana.com/docs/grafana/latest/dashboards/)
- [InfluxDB + k6](https://k6.io/docs/results-visualization/influxdb/)
- [Laravel Octane Performance](https://laravel.com/docs/octane)
- [PostgreSQL Performance](https://www.postgresql.org/docs/current/performance-tips.html)
