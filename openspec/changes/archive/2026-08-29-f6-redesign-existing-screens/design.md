# Design: F6 — Rediseño de pantallas existentes

## Technical Approach

Cuatro migraciones de presentación con el contrato de datos congelado. Se conservan
servicios, modelos y rutas; cambian plantilla y estilos. Esa contención es lo que
hace la fase predecible y lo que permite usar los specs existentes como red de
seguridad.

El Dashboard es el único que además añade capacidad nueva —cuatro visualizaciones—,
así que va al final y con un paso previo de inventario de datos.

## Architecture Decisions

**D1 — Los specs existentes son el contrato de no-regresión, y no se editan.**
Regla operativa de la fase: si un spec de Usuarios, Roles o Perfil requiere
modificación para volver a pasar, es que cambió el comportamiento, no la presentación
— y eso está fuera de alcance. La única excepción admisible son selectores de consulta
que apuntan a estructura de marcado; en ese caso se ajusta el selector, nunca la
aserción.

Es la decisión que hace la fase auditable. Sin ella, «rediseñar» se convierte en
reescribir con los tests siguiendo detrás.

**D2 — Orden: Perfil → Roles → Usuarios → Dashboard.**
De menor a mayor superficie. Perfil valida el procedimiento de migración con el menor
riesgo posible; el Dashboard va al final porque es el único que introduce
visualizaciones y consultas de datos nuevas.

**D3 — Inventario de datos del Dashboard antes de maquetar.**
El mock 01-01 muestra cinco KPI, top de categorías, actividad reciente y rendimiento
semanal. Antes de escribir una plantilla se contrasta cada dato contra lo que la API
expone hoy (`incidents`, `incident-analytics`).

Resultado esperado por dato:

| Dato del mock | Acción si la API lo expone | Acción si no |
|---|---|---|
| Total, en proceso, resueltas, pendientes | Consumir | Documentar como pregunta |
| Tasa de resolución, tiempo promedio | Consumir | Documentar como pregunta |
| Top 5 categorías | Consumir | Documentar como pregunta |
| Actividad reciente | Consumir | Documentar como pregunta |
| Recibidas vs resueltas por día | Consumir | Documentar como pregunta |

**Nunca rellenar con valores fijos de ejemplo.** Un dashboard con cifras inventadas es
peor que uno incompleto: parece funcionar. Lo que falte se muestra con guion y se
registra como pregunta abierta para un change de backend.

**D4 — Gráficos con echarts vía `ngx-echarts`.**
`echarts@6` y `ngx-echarts@22` ya son dependencias y `features/reports/kpi-dashboard`
ya las usa. Se rechaza introducir otra librería: habría dos motores de gráficos con
estéticas distintas en el mismo producto.

Las series toman sus colores de los tokens de F0, leídos desde CSS custom properties;
ningún literal hexadecimal en la configuración de los gráficos. Es lo que mantiene los
gráficos alineados si la paleta se ajusta.

**D5 — Guion, no cero, ante métrica indisponible.**
Misma regla que F3/D8. Cero es un valor con significado propio («ninguna incidencia
pendiente»); mostrarlo cuando el cálculo falló convierte un error en un dato falso.

**D6 — La retirada del andamiaje se verifica antes de ejecutarse.**
El `:root` de compatibilidad de F0 (`--primary-color`, `--accent-color`, `--dark-text`,
`--muted-text`, …) se elimina **sólo** tras comprobar por búsqueda que ningún archivo
lo consume. Si sobrevive alguna referencia, el bloque se conserva y se documenta qué
la usa. Eliminarlo a ciegas produce fallos visuales silenciosos: el CSS no avisa de
una variable inexistente, simplemente no aplica la regla.

**D7 — `*hasPermission` se aplica a Usuarios y Roles.**
Hoy esas pantallas no lo usan: se construyeron antes de que F2 lo introdujera.
`operador_org` (15 permisos) ve botones que el servidor le rechaza con 403. Se corrige
como parte de la migración, no como cambio de comportamiento — ocultar una acción
imposible es presentación.

## Data Flow

Sin cambios en Usuarios, Roles y Perfil: mismos servicios, mismos modelos, misma
navegación.

**Dashboard** (único con flujo nuevo):
carga → peticiones en paralelo de KPI, top de categorías, actividad reciente y serie
semanal → cada bloque renderiza su propio estado de carga sin bloquear a los demás →
la configuración de cada gráfico deriva sus colores de los tokens de F0

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `frontend/src/app/features/profile/profile.component.html` | Reescribir (D2) | Mock 10-01 sobre primitivos |
| `frontend/src/app/features/profile/profile.component.css` | Eliminar o reducir | Lo que absorban los primitivos |
| `frontend/src/app/features/admin/roles/**` | Reescribir | Mocks 04-01 y 04-02 |
| `frontend/src/app/features/admin/users/**` | Reescribir (D7) | Mocks 03-01 y 03-02; añade `*hasPermission` |
| `frontend/src/app/features/dashboard/dashboard.component.*` | Reescribir (D3/D4) | Mock 01-01 completo |
| `frontend/src/app/features/dashboard/components/top-categories-chart/` | Nuevo (D4) | Barras horizontales |
| `frontend/src/app/features/dashboard/components/weekly-performance-chart/` | Nuevo (D4) | Barras agrupadas |
| `frontend/src/app/features/dashboard/components/recent-activity/` | Nuevo | Panel de actividad reciente |
| `frontend/src/app/core/services/dashboard.service.ts` | Nuevo/Modificar (D3) | Agrega los datos del dashboard |
| `frontend/src/styles/_variables.css` | Modificar (D6) | Retira el `:root` de compatibilidad, previa verificación |
| `frontend/src/styles/_components.css`, `_forms.css`, `_tables.css` | Limpiar | Elimina reglas sin consumidores |

## Redis Caching Strategy

No aplica — F6 no toca backend.

## Testing Strategy

- **No-regresión (D1)**: los specs existentes de Usuarios, Roles y Perfil deben pasar
  **sin editar aserciones**. Ajustar un selector de marcado es admisible; ajustar una
  aserción no lo es, y señala que se cambió comportamiento.
- **Dashboard**: cada bloque renderiza con datos; métrica ausente ⇒ guion, nunca cero
  ni valor de ejemplo (D5); gráfico sin datos ⇒ estado vacío explícito.
- **Gráficos**: la configuración deriva sus colores de los tokens; ningún literal
  hexadecimal en el objeto de opciones.
- **Permisos (D7)**: con `operador-org-1@tase.local`, las acciones de escritura de
  Usuarios y Roles no están en el DOM.
- **Limpieza (D6)**: test que falla si `--primary-color` o `--accent-color` reaparecen
  fuera de su declaración, para que el andamiaje no vuelva a colarse.
- **e2e**: recorrido de las cuatro pantallas verificando que su funcionalidad
  —búsqueda, alta, edición, guardado— sigue operativa tras el rediseño.
- Comandos: `pnpm lint && pnpm test && pnpm build` y `pnpm test:e2e` desde `frontend/`.

## Open Questions

- **Q1 — RESUELTA PARCIALMENTE** (inspección + equipo, 2026-08-29). Se revisó qué
  muestra cada una:

  | Ruta | Contenido real | Recomendación |
  |---|---|---|
  | `/app/reportes/dashboard` | `<p>dashboard-kpi works!</p>` — scaffold vacío de Angular CLI | **Eliminar.** No es una pantalla, es un archivo generado que nunca se implementó |
  | `/app/reportes/listado-clientes` | «Listado de Clientes» funcional, con filtros y exportación a PDF | **Confirmar con el equipo.** TASE no tiene el concepto de «cliente»: su dominio es incidencias, organizaciones y usuarios. Sumado al `alt="AquaSync Olón Logo"` que F0 corrige en el sidebar, todo apunta a que el frontend se derivó de otro proyecto y esta pantalla vino con él |
  | `/app/admin/config` | «Configuraciones del Sistema» — CRUD real de variables globales, formato de reportes y caché | **Conservar y rediseñar.** Es funcionalidad legítima; sólo le falta mock |

  Acción para F6: eliminar el scaffold vacío, rediseñar `system-config` con los
  primitivos aunque no tenga mock, y **no tocar `listado-clientes` hasta que el equipo
  confirme** si pertenece al producto. Borrar una pantalla funcional por sospecha de
  origen no es decisión de esta fase.
- **Q2** — Los datos del Dashboard que la API no exponga (D3) requieren un change de
  backend. Se listarán en el apply-progress al completar el inventario.
