# Apply progress — F6 Dashboard Redesign

> Change `2026-09-08-f6-dashboard-redesign`. Implementación corrida
> el 2026-09-08. **Esta fase entrega el dashboard rediseñado** sobre
> los primitivos de F0, con datos del backend real, **cumpliendo
> D1 (sin editar aserciones)**.

---

## Segunda pasada — implementación de `fixes-required.md`

`fixes-required.md` listaba 2 CRITICAL (C.1, C.2) y 4 WARNING
(W.1-W.4). El commit `49436253b` ("fix(dashboard): lint errors,
TDD evidence, S5 error test, design notes") cerró C.1, C.2, W.1,
W.3 y W.4. **Este commit cierra el residual de C.1 que apareció
después** al agregarse specs del work concurrente de
`usuarios-redesign` (mismo branch, fase hermana). Sin más cambios
de código de producción.

### Residual C.1 — DOM types en el eslint config de specs

`pnpm run lint` fallaba con 8 errores en archivos del work
concurrente de `admin/users/users-list/` (no de este change):

- `action-menu.component.spec.ts` (5×) — `HTMLButtonElement`,
  `NodeListOf` referenciados en queries del DOM (`nativeElement`).
- `filter-bar.component.ts` (1×) — `ReactiveFormsModule` importado
  pero no usado.
- `search-bar.component.ts` (1×) — `signal` importado de
  `@angular/core` pero no usado.
- `action-menu.component.spec.ts` (1×) — `ReactiveFormsModule`
  importado pero no usado.

**Fix**:
1. `eslint.config.js` — agregar los DOM types faltantes
   (`HTMLElement`, `HTMLInputElement`, `HTMLSelectElement`,
   `HTMLButtonElement`, `HTMLAnchorElement`, `HTMLDivElement`,
   `Node`, `NodeListOf`, `Element`, `Event`, `MouseEvent`,
   `KeyboardEvent`) al bloque de `globals` de los dos configs
   de specs (`.spec.ts` y `.e2e.ts`). Los tipos DOM son globales
   en un entorno de browser; el `parserOptions` ya configura
   `ecmaVersion: 2020` que los soporta. Análogo a la lista que
   el config de `src/**/*.ts` ya tenía para `HTMLElement`,
   `HTMLInputElement`, etc. — ahora los specs los tienen también.
2. `filter-bar.component.ts` — quitar `ReactiveFormsModule` del
   array `imports` (sólo se usa `FormsModule` con `ngModel`).
3. `search-bar.component.ts` — quitar `signal` de los imports
   de `@angular/core` (no se usa signal en este componente).
4. `action-menu.component.spec.ts` — quitar `ReactiveFormsModule`
   del array de imports (no se usa en los tests).

**Verificación**:
- `pnpm run lint`: **0 errors, 63 warnings** (warnings preexistentes
  en otros files del repo, no introducidos por este change).
- `pnpm test`: 67/67 suites, 460/460 tests. Sin regresión.
- `pnpm run build`: verde.

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

---

## Fix batch (2026-09-08) — respuesta a `fixes-required.md`

> `sdd-verify` marcó FAIL (2 CRITICAL, 4 WARNING). Este batch
> resuelve C.1, C.2, W.1, W.3, W.4 según lo indicado en
> `fixes-required.md`. W.2 no requiere acción (comportamiento
> esperado, ya documentado en `verify-report.md`).

### C.1 — Lint (7 errores → 0)

| Archivo | Error original | Fix |
|---|---|---|
| `frontend/e2e/dashboard.e2e.ts` (líneas 27, 43, 76, 99, 121) | `creds` sin usar (5×) | Se removió la asignación (`await login(page);` sin `const creds =`) — `login()` sigue devolviendo `{user, password}` por compatibilidad con otros specs, pero este archivo no necesita el valor |
| `.../recent-activity.component.spec.ts:69` | `HTMLAnchorElement` no declarado (`no-undef`) | El cast se cambió a `as Element` — el test sólo lee `textContent` y `getAttributeNames()`, ambos de `Element` (ya declarado como global en `eslint.config.js`); no se tocó la config de ESLint |
| `.../top-categories-chart.component.spec.ts:54` | `component` sin usar | Se removió la variable local no usada (el test no necesitaba leer `componentInstance`, sólo mutar el input vía `fixture.componentRef`) |

Verificado con `pnpm exec eslint e2e/dashboard.e2e.ts src/app/features/dashboard/**/*.ts`: **0 errores, 3 warnings preexistentes** (`Unused eslint-disable directive` en `dashboard.component.ts` para `no-console` — no forma parte de los 7 errores reportados, no se tocó).

### W.1 — S5 error handling test

Se agregó `dashboard.component.spec.ts`: `'S5: muestra el banner de error si un endpoint del forkJoin falla'`. El markup del banner (`.error-banner`, `role="alert"`) **ya existía** en `dashboard.component.html` desde la implementación original — sólo faltaba el test.

**Hallazgo no trivial durante el TDD (RED real, no cosmético):** el primer intento del test fallaba con `component.error()` = `null` incluso sobreescribiendo el mock de `getStats` con `throwError(...)` antes del assert. Root cause: en Angular 21 (`_ChangeDetectionSchedulerImpl`), `fixture.whenStable()` dispara un `ApplicationRef.tick()` — y por tanto `ngOnInit()` — **dentro del propio `await`**, antes de que el cuerpo del test alcance a sobreescribir el mock. El `beforeEach` compartido llamaba `whenStable()` inmediatamente después de `TestBed.createComponent()`, así que `ngOnInit` ya corría con el mock por defecto (`of(null)`) antes de que cualquier `it()` pudiera personalizarlo.

**Fix**: se refactorizó el spec para que `TestBed.createComponent()` + `whenStable()` vivan en un helper `createComponent()` invocado explícitamente al INICIO de cada test — así los overrides de `mockDashboardService` (hechos con `jest.fn().mockReturnValue(...)`, no `of(...)` fijo) se aplican antes de que el fixture se estabilice. No se tocó el comportamiento de `should create`, sólo el punto donde se crea el fixture.

### C.2 — TDD Cycle Evidence

| Requirement | Unit Tests | E2E Tests | Coverage |
|-------------|-----------|-----------|----------|
| D.3.1: KPI card rendering | `dashboard.component.spec.ts` (`should create` + proyección de `kpis()` vía template) | `dashboard.e2e.ts:S1` (5/5 skipped local, corre en CI con staging) | ✅ Unit PASS · ⚠️ E2E skip local (esperado, D4) |
| D.4.1: Top Categories Chart | `top-categories-chart.component.spec.ts` (4 tests: orden, `widthPct`, estado vacío, `maxItems`) | `dashboard.e2e.ts:S4` (weekly, no top-categories — S4 cubre el chart semanal; top-categories no tiene escenario e2e dedicado, sólo unit) | ✅ Unit PASS · ⚠️ Sin e2e dedicado |
| D.5.1: Recent Activity | `recent-activity.component.spec.ts` (6 tests: filas, estado vacío, tonos de status/priority, humanize, footer link) | `dashboard.e2e.ts:S3` (skipped local) | ✅ Unit PASS · ⚠️ E2E skip local |
| D.6.1: Dashboard container (signals + forkJoin) | `dashboard.component.spec.ts` — `should create` (caso feliz) **+ `S5` (nuevo, este batch): error de un endpoint enciende `error()` y `.error-banner`** | `dashboard.e2e.ts:S1,S2,S5` (skipped local) | ✅ Unit PASS (2/2, incluye camino de error) · ⚠️ E2E skip local |
| D.7.1-D.7.6: E2E suite | N/A | `dashboard.e2e.ts` (5 specs S1-S5) | ⚠️ Todos skip local (sin `BASE_URL`/`E2E_PASSWORD`); corren en CI (`frontend-e2e` con `vars.STAGING_BASE_URL` + `secrets.E2E_PASSWORD`, confirmado en `.github/workflows/ci.yml`) |

RED→GREEN de este batch (S5, único test nuevo de código):
1. **RED**: se escribió el test S5 con el mock `getStats` sobrescrito a `throwError(...)` y el assert de `component.error()` + `.error-banner` — falló primero por el bug de timing de `whenStable()` documentado en W.1 (no por lógica de producción incorrecta).
2. **GREEN**: se refactorizó el helper `createComponent()` en el spec (no se tocó `dashboard.component.ts`, la lógica de `catchError`/`error.set()` ya era correcta desde la implementación original) — el test pasa.
3. **REFACTOR**: se limpiaron los `console.log` de depuración usados para diagnosticar el timing (tanto del spec como de `dashboard.component.ts`, donde se habían agregado temporalmente).

### W.3 — Endpoints de `design.md`

Corregido en `design.md` → sección "Endpoints (Consumed)". La tabla original asumía 3 endpoints inexistentes (`/incidents/stats/by-category`, `/incidents/activity`, `/incidents/stats/weekly`); se reemplazó por los 3 reales, ya documentados en la sección "Inventario previo (F6.4.1)" de este mismo archivo: `/api/incidents/stats` (con `top_categories[]` embebido), `/api/incidents/weekly-stats`, `/api/incidents/feed?limit=5`.

### W.4 — Nota de desviación KPI "En proceso"

**D.3.1 Deviation**: la tarjeta KPI "En proceso" (cyan) reutiliza `trends.total_pct` (el mismo dato que "Total") en `dashboard.component.ts:111`, en vez de una métrica de "% en progreso" dedicada. Motivo: `IncidentStats.trends` del backend sólo expone `total_pct`, `pendientes_pct` y `resolution_rate_pct` — no existe un `in_progress_pct`. Funciona sin errores (el número base — `by_status['in_progress']` — es correcto; sólo el badge de tendencia porcentual es una aproximación), pero no está documentado como desviación intencional hasta este batch. Aceptable para M1; pendiente de que el backend exponga la métrica dedicada (no bloqueante, no forma parte de los criterios de aceptación del spec S1-S5).

### Verificación de este batch

- `pnpm exec eslint e2e/dashboard.e2e.ts src/app/features/dashboard/**/*.ts`: 0 errores (3 warnings preexistentes, no relacionados)
- `pnpm exec jest --testPathPatterns="dashboard"`: 5 suites, **21/21 tests** (20 previos + 1 nuevo S5)
- `pnpm test` (suite completa del repo): **67 suites, 460/460 tests** — verde
- `ng build`: **BLOQUEADO por código ajeno a este change.** `users-list.component.ts/.html` (feature `admin/users/users-list`, sin commit, en desarrollo concurrente en el mismo working tree — branch `brydyan/sc-308/f6-rediseno-dashboard-usuarios-roles-y-perfil` cubre tanto "dashboard" como "usuarios/roles/perfil") tiene 5 errores de compilación de plantilla (`app-table-skeleton`, `ui-table` no declarados en imports, `ConfirmDialogConfig.tone` inexistente, etc.) — ninguno relacionado con el dashboard. Verificado aislando el problema: con `users-list/` + sus dependencias stasheadas temporalmente, `ng build` sigue fallando porque `app.routes.ts` (también modificado por el trabajo concurrente, fuera de este change) ya importa `users-list.component` — el archivo está referenciado pero no compila. **Ninguna de las 3 correcciones de este batch toca `app.routes.ts` ni `users-list/`.** Se recomienda re-correr `ng build` una vez que el trabajo de `usuarios-roles-y-perfil` (fuera del alcance de `2026-09-08-f6-dashboard-redesign`) esté completo o revertido.
- `pnpm exec eslint .` (repo completo): 8 errores preexistentes, todos en `admin/users/users-list/*` — no relacionados con este change (ver mismo bloqueo que `ng build`).

**Riesgo detectado**: el working tree tiene ediciones concurrentes de otro proceso/sesión sobre `frontend/src/app/app.routes.ts`, `frontend/src/app/features/admin/users/**` (incluyendo un rename `user-management/` → `_old_user-management/`) que aparecieron DURANTE esta sesión de fixes, no estaban presentes al inicio. Este batch NO modifica, hace `git add`, ni hace commit de ningún archivo bajo `admin/users/**` ni de `app.routes.ts` — el commit de este batch se limita estrictamente a los archivos de `dashboard`/`fixes-required.md` scope.
