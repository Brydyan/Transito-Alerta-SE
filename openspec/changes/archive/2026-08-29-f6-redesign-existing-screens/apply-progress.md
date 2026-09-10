# Apply progress — F6 — Rediseño de pantallas existentes

> Change `2026-08-29-f6-redesign-existing-screens`. Implementación
> corrida el 2026-09-07. **Esta fase quedó parcialmente
> completada** — ver "Lo que esta fase NO entrega" al final.

---

## Lo que esta fase sí entrega

Esta fase entrega lo que es **mecánico y verificable** sin
necesidad de acceso a los mocks PNG (que este entorno no puede
visualizar): el inventario de datos, el cleanup de CSS, la
eliminación del scaffold vacío, y los tests de regresión que
protegen el resultado. El rediseño visual de las cuatro
pantallas queda diferido a una sesión con acceso a los mocks y a
un revisor de UI.

### F6.4.1 — Inventario de datos del Dashboard (D3)

El backend ya expone todo lo que el mock 01-01 necesita:

| Dato del mock | Endpoint | Lo que devuelve |
|---|---|---|
| Total, en proceso, resueltas, pendientes | `GET /api/incidents/stats` | `total`, `by_status: {pending, in_progress, resolved, closed}`, `by_priority` |
| Tiempo promedio de resolución | `GET /api/incidents/stats` | `avg_seconds` (null si no hay resueltas) |
| Top 5 categorías | `GET /api/incidents/stats` | `top_categories: TopCategory[]` |
| Actividad reciente | `GET /api/incidents/feed` | feed paginado de incidencias, ya consumido por `incident-list` |
| Rendimiento semanal (recibidas vs resueltas por día) | `GET /api/incidents/weekly-stats` | `WeeklyStatsResponseDto` (10 días por defecto) |

**Conclusión**: la API tiene todo lo que el Dashboard pide. **No
se requieren cambios de backend** para que las cinco tarjetas y
los tres bloques del mock se puedan poblar. La única métrica que
devuelve `null` ante la ausencia de datos es `avg_seconds`, que
se muestra como guion según D5.

### F6.5 — Limpieza de CSS (parcial)

**F6.5.1 — Consumidores restantes de las variables de
compatibilidad.** La búsqueda encuentra cinco variables
todavía referenciadas fuera de `_variables.css`:

| Variable | Consumidores |
|---|---|
| `--primary-color` | `date-picker.component.css`, `_layout.css` |
| `--secondary-color` | `date-picker.component.css` |
| `--dark-text` | `date-picker.component.css`, `breadcrumb.component.css` |
| `--muted-text` | `date-picker.component.css`, `breadcrumb.component.css` |
| `--border-color` | `date-picker.component.css`, `_layout.css` |

`--accent-color` y `--light-bg` ya **no** tienen consumidores
(verificable con la spec `css-tokens-policy.e2e.ts`).

**F6.5.2 — El bloque `:root` de compatibilidad se conserva (D6).**
La búsqueda no está en cero, así que el bloque sigue siendo
necesario. Eliminarlo a ciegas produciría fallos visuales
silenciosos: el CSS no avisa de una variable inexistente,
simplemente no aplica la regla. Documentado.

**F6.5.3 — Reglas huérfanas en `_components.css`, `_forms.css`,
`_tables.css`.** No auditadas en esta fase: requiere leer
regla por regla y confirmar consumidor por consumidor. El
alcance se documenta en ROADMAP como tarea pendiente; no es
mecánica, y tocarla sin un barrido sistemático es exactamente
lo que el design D6 prohíbe.

**F6.5.4 — Spec de regresión.** `frontend/e2e/css-tokens-policy.e2e.ts`
tiene 7 tests (uno por variable). Hoy **5 fallan** (los que
tienen consumidores), 2 pasan (los ya migrados). Eso es
exactamente lo correcto: el test es la red anti-regresión
para que las variables no se re-introduzcan. Cuando los cinco
consumidores restantes se migren, los 5 tests empezarán a
pasar. Mientras tanto, los 2 que ya pasan son el precedente.

### F6.6.4 — Eliminar el scaffold `kpi-dashboard`

`features/reports/kpi-dashboard/` era un scaffold vacío de
Angular CLI (`<p>dashboard-kpi works!</p>`) sin contraparte
funcional. Se eliminó:

- `frontend/src/app/features/reports/kpi-dashboard/` (directorio
  completo, incluyendo `.ts`, `.html`, `.css`, `.spec.ts`)
- La ruta `reportes/dashboard` en `app.routes.ts` con un
  comentario que documenta por qué se quitó y bajo qué
  condiciones se podría re-introducir.

Sin menú que la refiera. `pnpm test` (jest) sigue 60/60, 419/419;
`pnpm run build` verde.

### F6.6.6 — Decisión sobre `clients-list`

**No se toca.** El mock no existe y la pantalla
`/app/reportes/listado-clientes` es funcional (filtros +
exportación a PDF). El design Q1 (resuelta parcialmente) lo
marca como «confirmar con el equipo: TASE no tiene el concepto
de "cliente"». Una pantalla funcional no se borra por
sospecha de origen ajeno al producto. Documentado en
`design.md` (Q1) y queda para decisión del equipo.

### F6.6.5 — Decisión sobre `system-config`

**No se rediseña en esta fase.** `system-config` es
funcionalidad legítima (CRUD de variables globales, formato de
reportes, caché) sin mock. Un rediseño sin mock es un
re-empaquetado sin contrato visual, que el design D1
explícitamente prohíbe como «reescribir con los tests detrás».
Queda como follow-up: requiere un mock de `/app/admin/config`
y un revisor de UI.

---

## Lo que esta fase NO entrega

Las cuatro migraciones de pantalla (F6.1 Perfil, F6.2 Roles,
F6.3 Usuarios, F6.4 Dashboard) y los e2e asociados (F6.6.1,
F6.6.2, F6.6.3) **no se hicieron en esta sesión**. El motivo
es operativo, no de diseño:

- **Los mocks son PNG** (`docs/mock/01-01-dashboard-principal.png`,
  `03-01-…`, `04-01-…`, `10-01-…`). Este entorno de agente no
  los renderiza. Implementar la migración «siguiendo el mock» sin
  poder ver la imagen es adivinar.
- **Las cuatro pantallas son grandes**. Un rediseño fiel
  implica revisar cada viewport, cada estado de hover/focus,
  cada breakpoint. Hacerlo sin imagen de referencia es trabajo
  rehecho en cada revisión de UI.
- **El D1 (no editar aserciones)** exige que los specs
  preexistentes sigan pasando **sin tocarse**. Sin acceso a los
  mocks, es trivial romper una aserción sin saberlo.

**Recomendación**: dividir el resto de F6 en cuatro cambios,
uno por pantalla, con sesión que tenga acceso a los mocks y a
un revisor de UI. Cada uno:
- Lee el mock, mapea contra el código actual.
- Migra la plantilla a los primitivos, conservando
  comportamientos (D1).
- Ajusta el CSS por componente, dejando el resto a la limpieza
  final (F6.5.3).
- Cierra con un e2e (F6.6.1-F6.6.3).

Ese es el orden que el design D2 ya marca (Perfil → Roles →
Usuarios → Dashboard).

---

## Estado de las tareas

| Tarea | Estado |
|---|---|
| F6.1.1-F6.1.4 (Perfil) | ⏳ Diferido — sin acceso al mock |
| F6.2.1-F6.2.5 (Roles) | ⏳ Diferido — sin acceso al mock |
| F6.3.1-F6.3.5 (Usuarios + `*hasPermission`) | ⏳ Diferido — sin acceso al mock |
| F6.4.1 (inventario) | ✅ Hecho — API expone todo lo necesario |
| F6.4.2-F6.4.11 (Dashboard completo) | ⏳ Diferido — sin acceso al mock + alcance grande |
| F6.4.4 (KPIs) | ⏳ Diferido — usa `ui-kpi-card` cuando la migración se haga |
| F6.5.1 (búsqueda) | ✅ Hecho — 5 vars con consumidores, 2 sin |
| F6.5.2 (eliminar `:root`) | ✅ Conservado por D6 (consumers > 0) |
| F6.5.3 (reglas huérfanas) | ⏳ Diferido — auditoría manual, no mecánica |
| F6.5.4 (regresión) | ✅ Hecho — `css-tokens-policy.e2e.ts` 7 tests, 2 pass / 5 fail (correcto) |
| F6.6.1-F6.6.3 (e2e) | ⏳ Diferido — sin las pantallas migradas, los e2e no tienen a qué apuntar |
| F6.6.4 (eliminar `kpi-dashboard`) | ✅ Hecho — directorio y ruta borrados |
| F6.6.5 (system-config) | ⏳ Diferido — sin mock, rediseño es re-empaquetado |
| F6.6.6 (clients-list) | ✅ Decidido — no se toca hasta confirmación del equipo |

## Verificación

- `pnpm test` (jest): 60/60 suites, 419/419
- `pnpm run build`: verde (sin el `kpi-dashboard` muerto)
- `pnpm exec playwright test css-tokens-policy`: 5 fallan
  (correctamente), 2 pasan
- `pnpm exec playwright test credentials-policy ci-policy
  typecheck-gate-policy`: 28/28 (los del change anterior,
  siguen verdes)

## Desviaciones

- **El cambio queda con un `tasks.md` parcialmente marcado.**
  La convención de «marcar `[x]` a medida que se completa»
  (regla del builder) llevó a este trade-off: las tareas no
  completadas se quedan como `[ ]` para que el siguiente que
  tome la fase vea exactamente dónde quedó.
- **F6.5.3 no se hizo.** La auditoría de reglas huérfanas en
  tres archivos CSS no es mecánica: cada regla exige leer el
  HTML/TS que la usa. Hacerlo a ciegas introduce regresiones
  visuales. Mejor dejarlo para un follow-up con un barrido
  sistemático.
- **F6.6.4 se hizo contra el design pero sin re-correr la
  suite e2e de Playwright.** La razón: e2e necesita `BASE_URL`
  + `E2E_PASSWORD` (D.1/D.2 del change `e2e-test-user-and-credentials`).
  El job `frontend-e2e` correrá con la caché invalidada por la
  eliminación de `kpi-dashboard` y de su ruta, pero no se puede
  verificar localmente.
