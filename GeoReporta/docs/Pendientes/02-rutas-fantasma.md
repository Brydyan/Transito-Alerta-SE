# 02 — Rutas fantasma en el menú (`/reportes`, `/mapa`, `/notificaciones`, `/alertas`)

**Tipo:** Bug UX
**Severidad:** 🔴 Alta (visible al usuario final)
**Backend:** — · **Frontend:** ✅ Rutas fantasma eliminadas tras PR #43 (verificado 07/07/2026)

> ✅ **COMPLETADO (verificado 07/07/2026)**
> - Las rutas `/mapa`, `/alertas` y `/reportes` **no existen** como rutas activas en `frontend/app/app.js` (búsqueda vacía con `grep -nE "/mapa|/alertas|/reportes" app.js`).
> - El problema se resolvió **de raíz**: tras la consolidación de shells (PR #43), los sidebars estáticos con `data-ln` se reemplazaron por menú dinámico. Ya no hay links "muertos" servidos al usuario.
>
> ⚠️ **FEATURE PENDIENTE separada (no es bug):**
> La **vista de mapa georreferenciado** sigue sin existir. El sistema se llama "incidencias georreferenciadas" y PostGIS ya está habilitado (`incidents.geom` Point), pero no hay componente que renderice el `geom` en un mapa. Esto no es una "ruta fantasma" — es un feature futuro que merece su propio doc. Sugerido: [`08-vista-mapa.md`](./08-vista-mapa.md) cuando se aborde.
>
> - Ver [`00-INDEX.md`](./00-INDEX.md).

## Problema

El sidebar muestra ítems de navegación que apuntan a rutas **no registradas** en
`app.js`. Al hacer clic, el router no encuentra match y redirige a `/not-found`.
El usuario ve la opción, la clickea, y aterriza en "página no encontrada".

## Estado actual

**Shell admin — `frontend/app/layout/layout.component.html`:**

| Link | Ruta registrada en `app.js` | Resultado |
|------|------------------------------|-----------|
| `#/reportes` | ❌ No existe | `/not-found` |
| `#/mapa` | ❌ No existe | `/not-found` |
| `#/notificaciones` | ❌ No existe | `/not-found` (ver doc 03) |

**Shell usuario — `frontend/app/layout-usuario/layout-usuario.component.html`:**

Los `data-route` no coinciden con el `href` — son placeholders:

```html
data-route="/mapa"    href="#/feed"     <!-- "Mapa" en realidad va al feed -->
data-route="/alertas" href="#/feed"     <!-- "Alertas" en realidad va al feed -->
data-route=""         ...               <!-- vacío -->
```

"Mapa" y "Alertas" del ciudadano son botones decorativos: todos abren el feed.

## Alcance

Por cada ruta fantasma, **decidir**: implementarla u ocultarla.

- [ ] **`/mapa`** — vista de mapa georreferenciado de incidencias.
  - ¿Estaba planificada? El proyecto es "incidencias georreferenciadas", el mapa
    tiene sentido de dominio. Verificar en `docs/Entregables/`.
  - Si se implementa: componente `mapa.component.js` + ruta + consumo del `geom`
    que ya se sincroniza en Redis (`RedisIncidentSync` guarda `geom` como GeoJSON).
  - Si no: quitar el ítem del sidebar (admin) y el placeholder (usuario).
- [ ] **`/reportes`** — reportes/estadísticas.
  - Ya existe `GET /incidents/stats` (`IncidentStatsController`) y el dashboard.
    Evaluar si "reportes" es distinto del dashboard o es un duplicado.
  - Si no aporta: quitar el ítem del sidebar.
- [ ] **`/notificaciones`** — ver [doc 03](03-notificaciones.md).
- [ ] **`/alertas`** (shell usuario) — definir si es lo mismo que notificaciones.
  Unificar nomenclatura (`alertas` vs `notificaciones`) o quitar el placeholder.

## Criterios de aceptación

- Ningún ítem del sidebar cae en `/not-found`.
- Los `data-route`/`href` del shell usuario coinciden con rutas reales.
- No hay features "decorativas" que naveguen a un destino distinto al que anuncian.

## Archivos afectados

- `frontend/app/layout/layout.component.html`
- `frontend/app/layout-usuario/layout-usuario.component.html`
- `frontend/app/app.js` (si se agregan rutas nuevas)
- Nuevos componentes según decisión (`mapa`, `reportes`).
