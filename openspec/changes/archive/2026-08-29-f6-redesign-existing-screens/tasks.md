# Tasks: F6 — Rediseño de pantallas existentes

**Change**: `2026-08-29-f6-redesign-existing-screens`
**Depende de**: F0 (primitivos), F2 (`*hasPermission`)
**Fuente del contrato**: `docs/mock/01-01`, `03-01`, `03-02`, `04-01`, `04-02`, `10-01`
**Working dir**: `frontend`
**Orden**: Perfil → Roles → Usuarios → Dashboard → Limpieza (D2)

> **Regla de la fase (D1)** — los specs existentes de Usuarios, Roles y Perfil deben
> seguir pasando **sin editar aserciones**. Ajustar un selector de marcado es
> admisible; ajustar una aserción significa que se cambió comportamiento, y eso está
> fuera de alcance. Es lo que separa «rediseñar» de «reescribir con los tests detrás».

---

## F6.1 — Perfil (valida el procedimiento)

- [ ] **F6.1.1** — Reescribir `features/profile/profile.component.html` según el mock 10-01, sobre `ui-page-header`, `ui-card` y `ui-button`.
- [ ] **F6.1.2** — Avatar sin imagen ⇒ iniciales sobre fondo de marca. Patrón heredado del app-shell legacy, resistente a pantallas de alta densidad porque el texto escala sin pérdida.
- [ ] **F6.1.3** — Reducir o eliminar `profile.component.css` según lo que absorban los primitivos. Si queda vacío, se borra el archivo; no se deja un archivo sin reglas.
- [ ] **F6.1.4** — Verificar que los specs existentes de Perfil pasan sin editar aserciones.

## F6.2 — Roles

- [ ] **F6.2.1** — Reescribir el listado según el mock 04-01, con `ui-table` y `ui-page-header`.
- [ ] **F6.2.2** — Reescribir el editor de rol según el mock 04-02, preservando el comportamiento actual de asignación de permisos.
- [ ] **F6.2.3** — Aplicar `*hasPermission` a las acciones de escritura (D7).
- [ ] **F6.2.4** — Limpiar el CSS por componente que quede sin uso.
- [ ] **F6.2.5** — Verificar que los specs existentes de Roles pasan sin editar aserciones.

## F6.3 — Usuarios

- [ ] **F6.3.1** — Reescribir el listado según el mock 03-01, con `ui-table`, búsqueda, filtros y `pagination`.
- [ ] **F6.3.2** — Reescribir el formulario según el mock 03-02, preservando las validaciones actuales.
- [ ] **F6.3.3** — Aplicar `*hasPermission` a alta y a las acciones de fila (D7). Hoy no lo usan: se construyeron antes de F2, y `operador_org` ve botones que el servidor rechaza con 403.
- [ ] **F6.3.4** — Limpiar el CSS por componente que quede sin uso.
- [ ] **F6.3.5** — Verificar que los specs existentes de Usuarios pasan sin editar aserciones.

## F6.4 — Dashboard

- [ ] **F6.4.1** — **Inventario de datos primero** (D3): contrastar cada dato del mock 01-01 contra lo que exponen `incidents` e `incident-analytics`. Registrar en el apply-progress qué está disponible y qué no.
- [ ] **F6.4.2** — Lo que la API no exponga se muestra con guion y se anota como pregunta para un change de backend. **Nunca rellenar con valores fijos de ejemplo**: un dashboard con cifras inventadas parece funcionar, que es peor que uno incompleto.
- [ ] **F6.4.3** — Crear o ampliar `core/services/dashboard.service.ts` para agregar los datos disponibles.
- [ ] **F6.4.4** — Cinco tarjetas KPI con `ui-kpi-card`: total, en proceso, resueltas, pendientes, tiempo promedio. Cada una con valor, icono y pie de tendencia.
- [ ] **F6.4.5** — `components/top-categories-chart/`: barras horizontales con echarts vía `ngx-echarts` (D4).
- [ ] **F6.4.6** — `components/weekly-performance-chart/`: barras agrupadas recibidas vs resueltas por día.
- [ ] **F6.4.7** — `components/recent-activity/`: lista con indicador de color, título, estado, prioridad, marcas de tiempo y enlace al historial completo.
- [ ] **F6.4.8** — Los colores de las series se leen de los tokens de F0 vía custom properties. **Ningún literal hexadecimal** en la configuración de los gráficos (D4).
- [ ] **F6.4.9** — Carga en paralelo: cada bloque muestra su propio estado sin bloquear a los demás.
- [ ] **F6.4.10** — Gráfico sin datos ⇒ estado vacío explícito, distinguible de un fallo de carga.
- [ ] **F6.4.11** — Specs: métrica ausente ⇒ guion (no cero, D5); gráfico sin datos ⇒ estado vacío; colores derivados de tokens.

## F6.5 — Limpieza

- [ ] **F6.5.1** — Buscar `--primary-color`, `--secondary-color`, `--accent-color`, `--dark-text`, `--muted-text`, `--border-color`, `--light-bg` en `frontend/src`. Registrar los consumidores restantes.
- [ ] **F6.5.2** — Si la búsqueda está en cero, eliminar el bloque `:root` de compatibilidad de `_variables.css` (D6). **Si sobrevive alguna referencia, conservar el bloque y documentar qué la usa** — el CSS no avisa de una variable inexistente, simplemente no aplica la regla, y el fallo sería silencioso.
- [ ] **F6.5.3** — Eliminar de `_components.css`, `_forms.css` y `_tables.css` las reglas que quedaron sin consumidores tras las cuatro migraciones.
- [ ] **F6.5.4** — Test de regresión: falla si `--primary-color` o `--accent-color` reaparecen fuera de su declaración.

## F6.6 — Cierre

- [ ] **F6.6.1** — e2e de las cuatro pantallas: la funcionalidad —búsqueda, alta, edición, guardado— sigue operativa tras el rediseño.
- [ ] **F6.6.2** — e2e con `operador-org-1@tase.local`: sin acciones de escritura visibles en Usuarios ni Roles.
- [ ] **F6.6.3** — `pnpm lint && pnpm test && pnpm build` y `pnpm test:e2e` desde `frontend/`.
- [ ] **F6.6.4** — Eliminar `features/reports/kpi-dashboard/` y su ruta `/app/reportes/dashboard` (Q1): es el scaffold `<p>dashboard-kpi works!</p>` de Angular CLI, nunca implementado.
- [ ] **F6.6.5** — Rediseñar `features/admin/system-config/` con los primitivos (Q1): es funcionalidad legítima —CRUD de variables globales, formato de reportes y caché—, sólo carece de mock. Mantener su comportamiento intacto (D1).
- [ ] **F6.6.6** — **No tocar** `features/reports/clients-list/` hasta que el equipo confirme si pertenece al producto (Q1). Registrar la pregunta en el apply-progress: TASE no tiene el concepto de «cliente», y todo apunta a que llegó con la plantilla de la que se derivó este frontend.

---

## Definition of Done

- Las cuatro pantallas siguen sus mocks y se construyen sobre los primitivos de F0
- Los specs preexistentes pasan **sin aserciones editadas**
- Dashboard con las cinco tarjetas KPI y los tres bloques del mock 01-01
- Datos no disponibles mostrados con guion y listados como preguntas abiertas — cero valores de ejemplo
- Colores de gráficos derivados de tokens, sin hexadecimales en la configuración
- `*hasPermission` aplicado en Usuarios y Roles
- Andamiaje `:root` retirado, o conservado con sus consumidores documentados
- Suites unitaria y e2e en verde
