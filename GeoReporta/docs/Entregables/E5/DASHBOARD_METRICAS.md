# Dashboard de Métricas E5 en Grafana

Complemento técnico a `GUIA_E5_METRICAS_INDICADORES.md`: automatiza el cálculo
de los indicadores de calidad y los publica en el Grafana que ya usa el
proyecto (`docker-compose.yml` raíz), en vez de calcularlos a mano en Excel.

## Qué se hizo

1. **`quality-metrics/scripts/collect-live-metrics.mjs`** — corre la suite de
   tests real (Pest en `backend/`, Vitest en `frontend/`) y cuenta líneas de
   código real en `backend/app` + `frontend/app`. Escribe
   `quality-metrics/data/live-metrics.json` con casos ejecutados/aprobados/
   fallidos y KLOC reales (no inventados).

2. **`quality-metrics/scripts/analyze-metrics.mjs`** — combina esos datos
   reales con `quality-metrics/data/defectos-manual.json` (severidad de
   defectos y desglose por módulo — esto sigue siendo manual porque es
   juicio de QA, no algo que el código exponga) y calcula los 5 indicadores
   de la guía E5 (tasa de éxito, cobertura funcional, densidad de defectos,
   % corrección, índice de peligrosidad). Escribe
   `quality-metrics/data/latest.json` y agrega un snapshot con timestamp a
   `quality-metrics/data/metrics-history.json`.

3. **Grafana** — se reutilizó la instancia que ya corre en el
   `docker-compose.yml` de la raíz (la misma que muestra los dashboards de
   Laravel App y k6), no se levantó una segunda. Se agregó:
   - `ops/grafana/provisioning/datasources/e5-infinity.yml` — datasource
     [Infinity](https://github.com/grafana/grafana-infinity-datasource) que
     lee JSON por HTTP.
   - `ops/dashboards-e5/e5-calidad.json` — el dashboard (8 paneles: tasa de
     éxito, cobertura funcional, densidad de defectos, % corrección,
     aprobación por módulo, severidad, burn-down, tendencia entre
     ejecuciones), en la carpeta "E5 Calidad".
   - servicio `e5-metrics-data` (nginx) en el `docker-compose.yml` raíz —
     sirve `quality-metrics/data/*.json` para que el datasource Infinity los
     lea vía `http://e5-metrics-data/...` dentro de la red interna de Docker.

4. **Fix de entorno encontrado en el camino** (`backend/phpunit.xml`): sin la
   extensión `redis`, cualquier test que pega a una ruta instrumentada por
   Prometheus fallaba con `Class "Redis" not found`, porque
   `config/prometheus.php` usa su propio `PROMETHEUS_CACHE` (default
   `redis`), independiente del `CACHE_STORE=array` que ya estaba seteado
   para tests. Se agregó `PROMETHEUS_CACHE=array` al bloque `<php>` — bajó
   las fallas de backend de 136/293 a 8/293 en este entorno.

## Cómo correr los tests y actualizar el dashboard

Todo desde la **raíz del repo**:

```bash
# 1. Corre la suite real (backend + frontend) y cuenta KLOC real
node quality-metrics/scripts/collect-live-metrics.mjs

# 2. (opcional) editar quality-metrics/data/defectos-manual.json si cambió
#    la clasificación de severidad o el estado de algún módulo

# 3. Calcula los indicadores y guarda el snapshot
node quality-metrics/scripts/analyze-metrics.mjs

# 4. Levanta (o reusa) Grafana
docker compose up -d grafana e5-metrics-data
```

Abrir **http://localhost:3001** (`${GRAFANA_PORT:-3001}`) → carpeta
**"E5 Calidad"** → dashboard **"E5 - Métricas e Indicadores de Calidad"**.

Repetir los pasos 1 y 3 después de cualquier cambio real en el código (fix de
bug, nuevo test) para que el panel "Tendencia de Indicadores entre
Ejecuciones del Análisis" sume un punto nuevo — ahí se ve la evolución de
E4 → E5 → E6 en vez de una foto fija.

Detalle técnico completo (estructura de archivos, requisitos, troubleshooting)
en [`quality-metrics/README.md`](../../../quality-metrics/README.md).
