# Métricas de Calidad E5 (estilo k6 → Grafana)

Analiza los indicadores de calidad definidos en
`docs/Entregables/E5/GUIA_E5_METRICAS_INDICADORES.md` y los visualiza en
Grafana — mismo patrón que `perf/` (k6 → InfluxDB → Grafana): correr análisis
→ persistir resultados → dashboard, pero para métricas de calidad de software
en lugar de carga.

Dos fuentes, combinadas por `analyze-metrics.mjs`:

- **Real / automática** (`data/live-metrics.json`, generado por `collect-live-metrics.mjs`):
  casos ejecutados/aprobados/fallidos de correr la suite real (Pest backend +
  Vitest frontend), y KLOC contando líneas reales de `backend/app` + `frontend/app`.
- **Manual** (`data/defectos-manual.json`): severidad de defectos y desglose por
  módulo. No hay forma de derivar esto del código — la severidad es juicio de QA,
  y los tests automatizados no mapean 1:1 a los 10 módulos del plan de pruebas
  manual de E4 (Estados, Asignación, Ubicación, etc. no tienen carpeta de test
  dedicada). Se edita a mano en cada ciclo.

Usa el Grafana que **ya existe** en el `docker-compose.yml` de la raíz del repo
(el mismo que sirve los dashboards de Laravel App y k6) — no levanta una
instancia nueva. Solo agrega:

- `ops/grafana/provisioning/datasources/e5-infinity.yml` — datasource Infinity (`uid: e5metrics`)
- `ops/dashboards-e5/e5-calidad.json` — el dashboard, cargado en la carpeta "E5 Calidad"
- servicio `e5-metrics-data` (nginx) en el compose raíz — sirve `data/*.json` para que
  el datasource Infinity los lea vía `http://e5-metrics-data/...`

## Estructura

```
quality-metrics/                    # raíz del repo
├── data/
│   ├── defectos-manual.json   # severidad + módulos (editar a mano cada ciclo)
│   ├── live-metrics.json      # casos + KLOC reales (gitignored, generado)
│   ├── latest.json            # snapshot combinado (gitignored, generado)
│   └── metrics-history.json   # historial de snapshots (gitignored, generado)
└── scripts/
    ├── collect-live-metrics.mjs  # corre la suite real + cuenta KLOC real
    └── analyze-metrics.mjs       # combina fuentes, calcula indicadores

ops/                                 # raíz del repo — infra compartida
├── dashboards-e5/e5-calidad.json
└── grafana/provisioning/
    ├── dashboards/dashboards.yml   # ya tenía 'Laravel App' y 'k6' — se agregó 'E5'
    └── datasources/e5-infinity.yml
```

## Uso

Todos los comandos corren desde la **raíz del repo**.

1. Correr la suite real y contar KLOC:
   ```bash
   node quality-metrics/scripts/collect-live-metrics.mjs
   ```
   Corre `php artisan test --no-coverage --log-junit ...` en `backend/` y
   `npm run test -- --reporter=junit` en `frontend/`, parsea los JUnit y escribe
   `quality-metrics/data/live-metrics.json`.
2. (Opcional) Actualizar `quality-metrics/data/defectos-manual.json` si hubo
   cambios en la clasificación de defectos o el estado de los módulos.
3. Calcular los indicadores:
   ```bash
   node quality-metrics/scripts/analyze-metrics.mjs
   ```
   Imprime los indicadores en consola, escribe `quality-metrics/data/latest.json`
   y agrega un snapshot a `quality-metrics/data/metrics-history.json`.
4. Levantar (o reusar) Grafana:
   ```bash
   docker compose up -d grafana e5-metrics-data
   ```
   Si ya tenés el stack completo corriendo (`docker compose up -d`), esto no
   hace nada nuevo salvo asegurar que `e5-metrics-data` esté arriba.
5. Abrir http://localhost:${GRAFANA_PORT:-3001} — dashboard
   **"E5 - Métricas e Indicadores de Calidad"** en la carpeta "E5 Calidad".

Para ver la tendencia entre ejecuciones (panel "Tendencia de Indicadores"),
repetir los pasos 1 y 3 después de un cambio real en el código — cada corrida
agrega un punto nuevo al historial. No hace falta reiniciar Grafana al
regenerar los datos, solo refrescar el dashboard (Infinity re-pega a
`e5-metrics-data` en cada carga de panel).

## Requisitos

- Node.js (sin dependencias externas, usa `fs`/`path`/`child_process` nativos)
- PHP + Composer con la suite backend operativa (mismas extensiones que CI:
  ver `.github/workflows/ci.yml`)
- `npm install` corrido en `frontend/`
- Docker + Docker Compose (el stack principal del repo)

## Nota sobre el fix en `backend/phpunit.xml`

Al conectar la suite real se encontró que `php artisan test` fallaba en seco
(sin salida, exit 1) por falta de driver de coverage — se resuelve pasando
`--no-coverage` (ya lo hace `collect-live-metrics.mjs`). Además, sin la
extensión `redis`, cualquier test que pega a una ruta instrumentada por
Prometheus reventaba con `Class "Redis" not found`, porque
`config/prometheus.php` usa su propio `PROMETHEUS_CACHE` (default `redis`),
independiente del `CACHE_STORE=array` que ya estaba seteado para tests. Se
agregó `<env name="PROMETHEUS_CACHE" value="array"/>` a `backend/phpunit.xml`
— bajó las fallas del backend de 136/293 a 8/293 en este entorno.

Los 8 fallos restantes (backend) y 29 (frontend) son reales — reglas de menú,
autorización de historial de estados, un test que sí requiere Redis de
verdad (`FeedRebuildCommandTest`). No se tocaron: son señal legítima para el
dashboard, no ruido de entorno.
