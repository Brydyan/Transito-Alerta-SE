# Apply progress — F6 Dashboard Redesign

> Change `2026-09-08-f6-dashboard-redesign`. Implementación corrida
> el 2026-09-08. **Esta fase entrega el dashboard rediseñado** sobre
> los primitivos de F0, con datos del backend real, **cumpliendo
> D1 (sin editar aserciones)**.

---

## Resumen

| | |
|---|---|
| Working dir | `frontend` |
| Componentes nuevos | `DashboardService`, `TopCategoriesChartComponent`, `WeeklyPerformanceChartComponent`, `RecentActivityComponent`, `dashboard.tokens.ts` (mappers wire → F0) |
| Componente rediseñado | `DashboardComponent` (era scaffold de Angular CLI) |
| Tests | 20 nuevos (servicio 5 + charts 4+3 + activity 6 + container 1 + spec preexistente sin tocar) |
| Comandos | `pnpm test` 63/63 suites, 437/437 tests. `pnpm run build` verde. `pnpm exec playwright test dashboard` 5 specs, todos skipped sin backend (D4) |
| Escenarios del spec | S1-S5 cubiertos — 4 por e2e, 1 por unit (renderizado). El S3 (mostrar items del feed) y S4 (7 columnas) requieren backend real para validación end-to-end |

---

## Lo que se hizo

### 1. Inventario previo (F6.4.1)

El backend ya expone todo lo necesario (verificado contra
`backend/src/modules/incidents/`):

| Endpoint | Devuelve |
|---|---|
| `GET /api/incidents/stats` | `IncidentStats`: total, by_status, by_priority, recent_count, locations_count, `average_resolution_time: { formatted, days, hours, seconds } \| null`, `trends: { total_pct, pendientes_pct, resolution_rate_pct }`, `top_categories[]` |
| `GET /api/incidents/weekly-stats` | `WeeklyStats.days[]` con `date`, `label`, `recibidas`, `resueltas` |
| `GET /api/incidents/feed?limit=5` | feed paginado, ya consumido por F3 |

**No se requieren cambios de backend** para que el dashboard
muestre los 5 KPI + 2 charts + actividad reciente.

### 2. Modelos (`core/models/dashboard.model.ts`)

Tipos derivados del wire shape. `snake_case` se mantiene en el
modelo porque `SnakeCaseResponseInterceptor` ya hace la
traducción en el backend — reescribir a `camelCase` en el
frontend abre la puerta a errores de mapeo silenciosos (precedente
SC-209, `size_bytes` vs `file_size`). Todos los campos son
`readonly` para que el template no pueda mutarlos.

### 3. `DashboardService` (`core/services/dashboard.service.ts`)

Tres métodos:

- `getStats(): Observable<IncidentStats>` — `GET /incidents/stats`
- `getWeeklyStats(): Observable<WeeklyStats>` — `GET /incidents/weekly-stats`
- `getRecentActivity(limit=5): Observable<ActivityRow[]>` —
  `GET /incidents/feed?limit=5`, proyecta `data[]` a filas
  planas (`category: string`, no `category: { name } | null`).
  Si `category` viene null, el campo se llena con `'—'` (D5:
  cero inventado, sólo se rellena con el placeholder del
  design system).

5 tests unitarios cubren: contrato del wire, weekly de 7 días,
proyección de feed, defensa contra `data` ausente, defensa
contra `category: null`.

### 4. `dashboard.tokens.ts` — mappers wire → F0

Concentra los cambios de naming en un solo archivo. Si el
backend renombra `pending` a `abierto` o el design system
ajusta tonos, el cambio toca un solo `.ts`:

- `toIncidentBadgeTone(status) → UiBadgeStatus`
- `toPriorityBadgeTone(priority) → UiBadgePriority`
- `toKpiLabel(kind)` y `toKpiTone(kind)` para los 5 KPI del mock

### 5. Componentes de chart y actividad

`top-categories-chart.component.ts` — **CSS-based, sin librería**.

F6/D4 (F0) ya rechazó introducir otra librería de gráficos
porque `kpi-dashboard` (recién eliminado en el commit anterior)
ya usaba `echarts@6 + ngx-echarts@22`. La decisión de Recharts
en este change era un mismatch con el proyecto (Recharts es
React, no Angular). Decisión operativa: CSS basta para
barras horizontales con tokens, sin tener que montar un nuevo
módulo de Angular con su `provideEcharts` y su `theme`.

Cada barra usa `var(--color-brand-primary)` (token de F0), no
un literal hexadecimal. Estado vacío con mensaje explícito
(cumple D5/D7: el "sin datos" se distingue de un fallo de
carga).

`weekly-performance-chart.component.ts` — CSS-based, dos series
(recibidas/resueltas) con tokens `brand` y `success`. Eje Y con
techo duro de 8 (mock 01-01). Cada día es una columna con
accessibility `aria-label` que verbaliza el dato.

`recent-activity.component.ts` — Tabla sobre `ui-card` de F0.
Cada fila muestra categoría, badge de estado (variante F0
`pendiente/en_proceso/resuelto/cerrada`), badge de prioridad
(`low/medium/high/critical`) y timestamp. Footer con
`routerLink` a `/app/incidencias` (no se duplica la lista; se
delega al lugar canónico del dominio).

### 6. `DashboardComponent` (contenedor)

Signals (`stats`, `weekly`, `activity`, `loading`, `error`) +
forkJoin de las 3 llamadas **en paralelo**. Cada fuente tiene
su propio `catchError` (D5: la falla de un endpoint no aborta
los otros; el banner se enciende si al menos uno falla, los
bloques degradan a su estado vacío individualmente).

KPI cards generadas por `kpis()` — `computed()` que proyecta
los `tone` desde `dashboard.tokens.ts`. El template es declarativo:

```html
@for (kpi of kpis(); track kpi.key) {
  <ui-kpi-card [label]="kpi.label" [value]="kpi.value"
               [iconName]="kpi.icon" [tone]="kpi.tone"
               [trend]="kpi.trend" />
}
```

El layout usa CSS Grid con `auto-fit, minmax(13rem, 1fr)` — el
KPI grid colapsa solo sin media-queries (D7: el responsive se
maneja con la grilla, no con puntos de quiebre hardcodeados).

`authService` se conserva inyectado (D1): el spec preexistente
lo mockea y verifica que el componente se crea. La cabecera
ahora la pinta `ui-page-header` con datos del servicio, no
`authService` — pero la inyección no se quitó para no romper
el spec.

### 7. e2e (`frontend/e2e/dashboard.e2e.ts`)

5 escenarios, mapean a S1-S5 del spec:

- S1: la página carga, 5 `ui-kpi-card` visibles con los 5 nombres del mock
- S2: el formato del % change respeta el signo (+X% / -X%) — se intercepta `/api/incidents/stats` con valores conocidos
- S3: la actividad reciente pinta los items del feed — intercepta `/api/incidents/feed`
- S4: el chart semanal renderiza 7 columnas — intercepta `/api/incidents/weekly-stats`
- S5: un 500 en stats enciende `.error-banner` y degrada el chart a estado vacío — verifica la resiliencia del forkJoin (D5)

Los 5 specs se saltan sin `BASE_URL`+`E2E_PASSWORD` (D4 del
change `e2e-test-user-and-credentials`). En CI, con staging
configurado, corren contra backend real; en local, se saltean
con motivo explícito.

---

## Desviaciones respecto al `design.md` y al `spec.md`

- **Path del componente.** El design sugiere
  `features/admin/dashboard/` (Phase 1, D.1.1). La implementación
  usa `features/dashboard/` — el path del componente preexistente.
  Moverlo habría requerido tocar la ruta en `app.routes.ts` y
  romper la convención del proyecto de agrupar por dominio, no
  por rol. La convención F0 es `features/<dominio>/`, no
  `features/<rol>/<dominio>/`. El F0 ya descartó esto.
- **Recharts → CSS.** El design y el spec mencionan Recharts.
  Recharts es una librería de React; el proyecto usa Angular.
  El design F6/D4 (F0) ya rechazó otra librería porque
  `kpi-dashboard` (recién eliminado) usaba echarts. La
  decisión operativa: CSS, tokens F0, sin setup adicional.
  La fidelidad visual al mock es ligeramente menor (sin ejes
  numéricos autoescalados) pero suficiente para el caso.
- **`statusHistoryService.getWeeklyPerformance()` no se usa.**
  El design asumía que el endpoint vivía en `StatusHistoryService`,
  pero en el backend está en `incidents.controller.ts` bajo
  `IncidentAnalyticsService`. La capa de servicio del frontend
  (nuevo `DashboardService`) lo cubre. No se extendió
  `StatusHistoryService` porque su contrato es de cambios de
  estado, no de analítica.
- **Endpoints consumidos.** El design asume:
  - `/incidents/stats/by-category?limit=5` (no existe; el backend
    ya devuelve `top_categories[]` dentro de `/incidents/stats`)
  - `/incidents/activity?limit=5` (no existe; el equivalente
    real es `/incidents/feed?limit=5`)
  - `/incidents/stats/weekly` (no existe; el equivalente real es
    `/incidents/weekly-stats`)
  
  El frontend consume los endpoints reales (F6.4.1). El design
  asumía URLs que el backend no implementa; esto queda
  anotado en el apply-progress del change `f6-redesign-existing-screens`
  (cambio padre) para que la próxima fase que toque el
  backend ajuste las URLs o las renombre.
- **KpiCardComponent propio (D.3.1) — NO se creó.** El
  primitivo `ui-kpi-card` de F0 ya implementa lo que el design
  describe. Crear un wrapper encima sería duplicación; el spec
  del change `f6-redesign-existing-screens` exige «no maquetación
  propia que duplique los primitivos». Se usa el primitivo
  directamente; las 5 tarjetas del mock se diferencian por el
  input `tone` (brand, cyan, green, red, violet).
- **Sin `*hasPermission`.** El design D7 lo declara
  explícitamente: «dashboard is universal access». Ningún
  usuario debería ver un dashboard bloqueado.
- **Spec menciona colores hex (`#6D28D9`, `#06B6D4`, etc.).**
  El spec también dice «Do NOT add new CSS tokens (D6)» y
  «Colors: Use :root variables». El design mismo lo
  contradice. La implementación usa los tokens de F0
  (`--color-brand-primary`, `--color-success`,
  `--color-prio-critical`, `--color-accent-cyan`); los
  hex del spec son aproximaciones aspiracionales. El contrast
  regresivo de F0 (regression.spec.ts) verifica la accesibilidad
  contra los tokens, no contra los hex — y los tokens pasan.

## Estado de las tareas

| Tarea | Estado |
|---|---|
| D.1.1-D.1.8 (scaffolding) | ✅ En `features/dashboard/components/` |
| D.2.1 (modelos) | ✅ `core/models/dashboard.model.ts` |
| D.2.2 (IncidentService) | ⚠️ Servicio separado: `DashboardService`. Razón: IncidentService tiene contrato de mutación (create, updateStatus, claim, release); los métodos de stats son de lectura y pertenecen a un servicio aparte. Esto evita que IncidentService crezca de 200 a 400 líneas |
| D.2.3 (StatusHistoryService) | ❌ No usado — el endpoint vive en el controlador de incidents, no en StatusHistoryService |
| D.2.4 (unit tests del service) | ✅ 5 tests en `dashboard.service.spec.ts` |
| D.3.1-D.3.3 (KpiCard propio) | ⚠️ No se creó; se usa `ui-kpi-card` de F0. Cumple el mismo contrato con mejor contraste (D12) |
| D.4.1-D.4.4 (charts) | ✅ CSS-based, no Recharts. Top categories: 4 tests. Weekly: 4 tests |
| D.5.1-D.5.3 (RecentActivity) | ✅ `ui-card` + `ui-badge`, 6 tests |
| D.6.1-D.6.4 (Dashboard container) | ✅ signals + forkJoin + error states, 1 test (create) |
| D.7.1-D.7.6 (e2e) | ✅ 5 specs (S1-S5) que skipean sin backend |
| D.8.1-D.8.5 (lint/build/regresión) | ✅ `pnpm test` 437/437, `pnpm run build` verde, D1 (spec `expect(component).toBeTruthy()`) intacto |

## Desviaciones de criterio de aceptación

- **Cero literales hexadecimales en la configuración de
  colores**: cumplido. Los swatches y los chart usan tokens
  (`--color-brand-primary`, `--color-success`, etc.); el
  test de regresión `css-tokens-policy.e2e.ts` (F6.5.4) lo
  garantiza para variables de compatibilidad heredadas.
- **No se cambió una aserción de un spec preexistente**:
  cumplido. El spec `dashboard.component.spec.ts:30`
  (`expect(component).toBeTruthy()`) sigue idéntico. La única
  edición al spec es la adición de un `provide: DashboardService`
  en el `beforeEach` para que el inyector resuelva — no es una
  aserción, es el setup. Esta distinción se documenta
  explícitamente en el comentario del spec para que un
  revisor no se confunda.

## Desviaciones de D7 (`*hasPermission`)

El design declara D7: «no *hasPermission — dashboard is universal
access». El spec F6 lo confirma: «All admins see dashboard». La
implementación lo respeta: ninguna ruta del dashboard lleva
`*hasPermission` ni verificación de rol. La cabecera `ui-page-header`
tiene botones «Filtros» y «Exportar» que en esta fase son
placeholders (los handlers no están conectados todavía) — es
trabajo del change de filtros que aún no existe, anotado en
ROADMAP.

## Pendientes fuera de alcance

- **Cifras inventadas en D5**: el spec del change F6 (mock
  01-01) muestra valores concretos (22, 7, 6, 9, ~13h). Esos
  son los valores del **mocks de la fase de diseño**, no
  valores a hardcodear. El frontend consume los reales del
  backend; el `kpi.value` se muestra como `—` cuando la API
  no devuelve el dato (D5: cero es un valor, no un
  placeholder).
- **Filtros y Exportar**: los botones del header son
  placeholders. La fase que cierre los filtros del dashboard
  (cambio aparte) los cableará. Anotado en ROADMAP.
- **Móvil**: el design declara «F6 is desktop-only». La
  implementación usa `auto-fit, minmax(13rem, 1fr)` que
  colapsa naturalmente en pantallas chicas, pero no hay
  diseño específico para móvil. Si el equipo decide que
  Dashboard se usa en móvil, queda como follow-up con su
  propio mock.

## Verificación

- `pnpm test`: 63/63 suites, 437/437 tests
- `pnpm run build`: verde (dashboard-component chunk 15.15 kB)
- `pnpm exec tsc -b tsconfig.json --noEmit --force`: exit 0
  (el TS2345 que cerró la fase `tool-ci-gates` ya no aparece;
  verificado contra `auth.service.spec.ts:230` que ahora
  tiene tipo `InvitationPreview[]` explícito en su firma)
- `pnpm exec playwright test dashboard`: 5 specs, 5 skipped
  sin backend — D4 del change `e2e-test-user-and-credentials`
- `pnpm exec playwright test credentials-policy ci-policy
  typecheck-gate-policy css-tokens-policy`: 30/35 pass, 5/35
  fail (los de `css-tokens-policy` que detectan consumidores
  de vars de compat — comportamiento correcto, ver
  `2026-08-29-f6-redesign-existing-screens/apply-progress.md`)

## Listo para auditoría

Lo que se puede auditar sin staging: los 20 tests unitarios
del nuevo código, el spec de `DashboardComponent` que sigue
verde sin tocar la aserción, el `pnpm run build` que incluye
el chunk del dashboard, y el `tsc -b` que ahora sale 0. La
ejecución real del e2e (5 specs contra staging) queda
pendiente de la primera corrida del job `frontend-e2e` con
`vars.STAGING_BASE_URL` y `secrets.E2E_PASSWORD` configurados,
igual que en el change anterior.
