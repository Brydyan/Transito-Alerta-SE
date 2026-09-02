# Proposal: F6 — Rediseño de pantallas existentes

## Intent

F0 cambió los tokens de marca en sitio: paleta violeta, tipografía geométrica,
iconografía Lucide. Eso repintó automáticamente toda utilidad `bg-brand-*`, pero
**no** reorganizó maquetación. Las cuatro pantallas que existían antes de esta
tanda quedaron con paleta nueva sobre estructura vieja:

| Pantalla | Ruta | Mock | Estado tras F0 |
|---|---|---|---|
| Dashboard | `/app/dashboard` | 01-01 | Color correcto, estructura ajena al mock |
| Usuarios | `/app/admin/users` | 03-01, 03-02 | Ídem |
| Roles | `/app/admin/roles` | 04-01, 04-02 | Ídem |
| Perfil | `/app/profile` | 10-01 | Ídem |

Es deuda contraída a conciencia: F0 la documentó como riesgo R1 y F6 es su
liquidación. Va al final porque F2–F5 producen pantallas nuevas que ya nacen
alineadas, y porque migrar las viejas antes de que los primitivos estuvieran
probados en uso real habría significado migrarlas dos veces.

El Dashboard es el caso más sustancial: el mock 01-01 define cinco tarjetas KPI,
un gráfico de barras horizontales de top categorías, un panel de actividad reciente
y un gráfico de rendimiento semanal. `echarts@6` y `ngx-echarts@22` ya están
instalados.

## Scope

### In Scope
- **Dashboard**: cinco tarjetas KPI, top 5 categorías, actividad reciente,
  rendimiento semanal (mock 01-01)
- **Usuarios**: listado y formulario según mocks 03-01 y 03-02
- **Roles**: listado y editor según mocks 04-01 y 04-02
- **Perfil**: configuración según mock 10-01
- Migrar las cuatro a los primitivos de F0 (`ui-table`, `ui-page-header`, `ui-badge`,
  `ui-card`, `ui-button`, `ui-kpi-card`)
- Retirar el CSS heredado que quede sin consumidores
- Retirar el `:root` de compatibilidad de F0, si ya no lo usa nadie

### Out of Scope
- Cambios de contrato de backend. Si el mock exige un dato que la API no expone, se
  documenta y se abre change aparte.
- `/app/reportes/*` (dashboard KPI y listado de clientes): no tienen mock y no
  aparecen en el menú. Ver Q1.
- `/app/admin/config` (configuración del sistema): sin mock. Ver Q1.

## Capabilities

### New Capabilities
- ninguna

### Modified Capabilities
- `design-system`: se completa su adopción; el `:root` de compatibilidad introducido
  en F0 como andamio deja de ser necesario

## DB Schema Changes

Ninguna.

## Permission Requirements (RBAC)

Sin permisos nuevos. Se aplica `*hasPermission` (entregado en F2) a las pantallas de
Usuarios y Roles, que hoy no lo usan: `operador_org` no debe ver acciones de escritura
que el servidor le va a rechazar con 403.

## Domain Module Dependencies

- `backend/src/modules/users`, `roles`, `incidents`, `incident-analytics`
- Frontend: primitivos de F0, `*hasPermission` y `permissionGuard` de F2

## Approach

Una pantalla por vez, empezando por **Perfil** —la más pequeña— para validar el
procedimiento de migración con el menor riesgo, y terminando por el **Dashboard**,
que es el único que además incorpora visualizaciones nuevas.

Cada migración es una sustitución de maquetación con el contrato de datos intacto:
se conservan servicios, modelos y rutas; cambian plantilla y estilos. Esa contención
es lo que hace la fase predecible.

La limpieza de CSS heredado va al final, cuando ya se sabe qué quedó sin consumidores.

## Dependencies

- **Depende de**: F0 (primitivos), F2 (`*hasPermission`)
- **Bloquea**: nada. Es la última fase del plan.

## Risks

- **R1 — Regresión funcional al reescribir plantillas.** Son pantallas que hoy
  funcionan; el rediseño puede romperlas. Mitigación: los specs existentes deben
  seguir pasando sin modificarse. Un test que hay que editar para que pase es la señal
  de que cambió el comportamiento, no la presentación.
- **R2 — Datos que el mock muestra y la API no expone.** Particularmente en el
  Dashboard (tasa de resolución, tiempo promedio, rendimiento semanal). Mitigación:
  inventariar los datos requeridos **antes** de maquetar; lo que falte se documenta
  como pregunta, no se rellena con valores fijos.
- **R3 — Retirar el `:root` de compatibilidad demasiado pronto.** Se elimina sólo tras
  verificar por búsqueda que ningún archivo lo consume.
