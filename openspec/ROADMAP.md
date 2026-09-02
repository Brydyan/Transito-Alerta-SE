# Roadmap — Migración de frontend y cierre de paridad

> **Punto de entrada para sesiones nuevas.** Este archivo fija el orden, las decisiones
> ya cerradas y los hechos verificados del código, para que nadie los vuelva a discutir
> ni los redescubra.
>
> Fecha: 2026-08-29 · Artefactos SDD: `openspec/changes/` · Tickets: epic 192 «⚠️ GeoReporta» (workspace `upse`)

---

## Contexto en una línea

El código de GeoReporta se borró; **`docs/mock/` (18 PNG, 11 vistas) es la única fuente
de verdad visual**. El backend está muy por delante del frontend: 20 módulos de dominio
contra 8 rutas.

---

## Orden de ejecución

```
F0 ──┬──► F1 ──┬──► F2 ──┬──► F3 ──► F4 ──► F7
     │         │        │      ▲
     │         │        └──────┤
     │         └──► F5         │
     │                    315 ─┘
     └──► F6 ◄── F2
```

| # | Fase | Story | Est. | Qué hace |
|---|---|---|---|---|
| 1 | **F0** Design system ✅ | [300](https://app.shortcut.com/upse/story/300) | 5 | Tokens violeta, Outfit, Lucide, 6 primitivos — **completada y archivada 2026-09-02** |
| 2 | **F1** Navegación | [303](https://app.shortcut.com/upse/story/303) | 2 | Arregla el 404 del sidebar |
| — | **324** Test de contraste | [324](https://app.shortcut.com/upse/story/324) | 2 | Cierra el único requisito de `design-system` sin cobertura. Independiente: puede correr en paralelo a F1 |
| 3 | **315** Fix estados | [315](https://app.shortcut.com/upse/story/315) | 3 | Habilita `closed`, declara la máquina |
| 4 | **F2** Catálogos | [304](https://app.shortcut.com/upse/story/304) | 8 | Ubicaciones, Categorías, Organizaciones |
| 5 | **F3** Incidencias | [305](https://app.shortcut.com/upse/story/305) | 8 | Listado, detalle, comentarios, workflow |
| 6 | **F4** Ciudadano | [306](https://app.shortcut.com/upse/story/306) | 13 | Feed, asistente 4 pasos, mapa |
| 7 | **F7** Emergencias | [316](https://app.shortcut.com/upse/story/316) | 8 | Telegram + carga + aislamiento org |
| 8 | **F5** Menús dinámicos | [307](https://app.shortcut.com/upse/story/307) | 13 | Menús en BD, matriz rol×lectura/escritura |
| 9 | **F6** Rediseño | [308](https://app.shortcut.com/upse/story/308) | 5 | Dashboard, Usuarios, Roles, Perfil |

**Empezar por F0 → F1. 315 antes de F3.**

---

## Qué hace cada fase

### F0 — Design system ✅ · `archive/2026-08-29-f0-design-system-mock-alignment/`
Paleta navy/hi-vis → violeta del mock. Barlow Condensed → Outfit. Iconos unificados en
Lucide. Sidebar blanco con secciones. Seis primitivos: `ui-badge`, `ui-card`,
`ui-button`, `ui-table`, `ui-page-header`, `ui-kpi-card`.

**Completada y archivada** (2026-09-02, 4 pasadas de `sdd-verify`, 0 CRITICAL,
192/192 tests). Spec consolidado en `openspec/specs/design-system/spec.md`.

**Bloqueaba todo.** Sin primitivos estables, cada fase inventaba su propio botón —
ya no aplica, F1–F6 pueden consumir los primitivos.

**Deuda que dejó abierta, con dueño:**

| Qué | Dónde se cierra |
|---|---|
| El requisito de contraste no tiene test automatizado | [sc-324](https://app.shortcut.com/upse/story/324) · `front/2026-09-02-contrast-regression-test/` |
| Alias de puente `brand-navy`/`brand-hivis` vivos (21 consumidores) | [sc-323](https://app.shortcut.com/upse/story/323) · F6 |
| **12 archivos de `features/` sin icono** — `bi bi-*` sin hoja de estilos | F1–F6, pantalla por pantalla |
| `transformBackendMenu()` no popula `group`; el backend tampoco lo envía | F1 (anotado en su `tasks.md`) |
| `ui-table` no encapsula: los consumidores deben recordar las helper classes | sin asignar |

La tercera es una **regresión visual viva**: F0.2.5 retiró Material Symbols y Bootstrap
Icons del `index.html`, y esos 12 archivos renderizan hueco hoy, no «con estilo viejo».
Se difirió a propósito —esas pantallas se rediseñan igual— pero conviene no confundirla
con trabajo pendiente neutro.

### F1 — Navegación · `front/2026-08-29-f1-menu-routing-alignment/`
`MENU_MAP` apunta a rutas que no existen en `app.routes.ts` → las 5 entradas del sidebar
caen al wildcard 404. Reescribe el mapa en español con `group` y `order`, registra
placeholders para destinos futuros, engancha el huérfano `citizen-report`.

Entregable de fondo: **`menu-map.spec.ts`**, test que falla si rutas y menú divergen otra vez.

### 315 — Fix máquina de estados · `back/2026-08-29-fix-incident-state-machine/`
`closed` está en BD y en el tipo pero excluido de `ALLOWED_STATUSES`. Además conviven dos
semánticas contradictorias. Declara el grafo en `incident-state-machine.ts`, deriva
`ALLOWED_STATUSES` de él, añade permiso `CLOSE incidents`.

**Bloquea F3** — `workflow.util.ts` deriva de este grafo.

### F2 — Catálogos · `front/2026-08-29-f2-catalogs-crud/`
Tres módulos con backend completo y cero frontend. Orden interno: Categorías (fija el
patrón) → Organizaciones (lo copia) → Ubicaciones (árbol de 4 niveles).

Entrega además `*hasPermission` y `permissionGuard`, que F3 y F6 reutilizan.

### F3 — Incidencias · `front/2026-08-29-f3-incidents-module/`
El dominio central sin una sola pantalla. Listado con filtros en URL, filtro jerárquico
de categorías, detalle con historial, galería, mini-mapa y comentarios.

**Primera tarea, antes de maquetar: revalidar contratos.** `incident.service.ts` y
`comment.service.ts` existen sin consumidor; su mapeo nunca tocó el wire real.

### F4 — Ciudadano · `front/2026-08-29-f4-citizen-feed-wizard-map/`
Dos fases con compuerta (B no se integra antes que A).
- **A (backend)**: tablas `incident_followers` e `incident_corroborations`
- **B (frontend)**: asistente de 4 pasos con borrador en IndexedDB, feed con carga
  incremental, mapa Leaflet con clustering, reporte anónimo

### F7 — Emergencias · `back/2026-08-29-f7-emergency-dispatch/`
Dos bloques independientes.
- **A**: corrige que `assign()` no valide el tope **ni el alcance por organización** —
  defectos que ya afectan a producción
- **B**: Telegram avisa al `admin_org` ante `critical`; recordatorio cada 5 min mientras
  siga en `pending`, escalado a los 30 min, corte a la hora

### F5 — Menús dinámicos · `back/2026-08-29-f5-dynamic-menus/`
Sustituye `MENU_MAP` por 4 tablas: jerarquía, matriz rol×lectura/escritura, endpoints
asociados, más la pantalla de administración (mock 05-01).

Va al final porque F1 ya dejó la navegación funcionando: aquí no hay urgencia operativa.

### F6 — Rediseño · `front/2026-08-29-f6-redesign-existing-screens/`
Las 4 pantallas preexistentes quedaron con paleta nueva y maquetación vieja. Orden:
Perfil → Roles → Usuarios → Dashboard.

**Regla:** los specs existentes deben pasar **sin editar aserciones**. Si hay que tocar
una, se cambió comportamiento y eso está fuera de alcance.

---

## Decisiones cerradas — NO reabrir

| Tema | Decisión |
|---|---|
| Paleta | Violeta del mock. `--color-brand-hivis` se elimina, no se deja huérfano |
| Tipografía | Outfit (inferida de los PNG). Aislada en `--font-sans` |
| Iconos | Lucide, familia única. El backend ya emite nombres Lucide |
| Prioridades | **Cuatro**: `low`, `medium`, `high`, `critical`. Los mocks sólo dibujan tres |
| Emergencia | Es `priority = 'critical'`. **No** un tipo de incidencia aparte |
| Estados | Cuatro, **ramificados**: `resolved` y `closed` son terminales alternativos |
| `critical` al crearse | Nace en `pending`, **no** salta a `in_progress` |
| Cerrar incidencia | Sólo `admin_org` y `master`, vía permiso `CLOSE incidents` |
| `pending → closed` | Permitido, para descartar reportes inválidos o duplicados |
| Perfil en el sidebar | **Fuera** — ya está en el menú de usuario del encabezado |
| Grupos del sidebar | `CATÁLOGOS` sólo para tablas de referencia (Categorías, Ubicaciones) |
| Roles de cliente | No existen como catálogo aparte. `roles` es global |
| Bot de Telegram | Una vía: notifica y enlaza. No se asigna desde Telegram |
| Destinatario de emergencia | `admin_org`, **no** un grupo de operadores |
| Notificación al operador | Sólo al **asignado**, nunca a todos |
| Excepción al tope | Limitada a `critical`, con motivo y autor registrados |
| Permiso de excepción | **No** se añade `OVERRIDE assignments` — `ASSIGN` ya está bien acotado |

---

## Hechos verificados del código

Comprobados contra migraciones y fuente. **No re-derivar.**

- **Roles: son cinco**, no cuatro. `master`, `operador_sistema`, `admin_org`,
  `operador_org` y **`reporter`** (el ciudadano, sembrado en `0009`). `users.js` no crea
  ningún usuario con `reporter`, por eso pasa desapercibido
- **El anónimo no tiene rol, y es deliberado.** Sus permisos salen de `auth.config.ts` →
  `anonymousPermissions`, no de `roles`. `AuthService.getPermissions` ramifica por
  `device_uuid === 'anonymous'`. Ampliar `reporter` nunca amplía el techo anónimo
- **`roles` no tiene `organization_id`** — catálogo global con `name` único
- **`critical` ya existe** en `0004_incidents.sql:27` y en todo el backend
- **El reporte anónimo de emergencia ya está soportado** — ver
  `auth.config.spec.ts:56`
- **`@nestjs/schedule@6.1.3` instalado**; **no hay tabla de auditoría**; **la acción
  `CLOSE` no existe** en el `CHECK` de `permissions.action`
- **`users.permissions` es copia denormalizada de `roles.permissions`.** Toda migración
  que conceda permisos debe tocar **ambas tablas** e invalidar `perm:v3:uid:*`
- **`menu:v1:*` y `perm:v3:uid:*` son espacios distintos.** Confundirlos ya costó una
  sesión de depuración
- **`SnakeCaseResponseInterceptor`** reescribe toda respuesta: los modelos frontend se
  derivan del **controlador**, no de la clase DTO

---

## Defectos abiertos

| Defecto | Dónde | Cubierto en |
|---|---|---|
| `closed` inalcanzable desde el flujo | `incident-workflow.service.ts:31,46` | 315 |
| `assign()` no valida el tope de carga | `assignments.service.ts:28-36` | F7 / A.2 |
| Escrituras de asignación sin acotar por organización | `assignments.controller.ts` | F7 / A.5 |
| Sidebar cae al 404 | `menu-map.ts` ↔ `app.routes.ts` | F1 |

**Patrón común: reglas implementadas a medias** — aplicadas en el camino por donde entró
la funcionalidad y no en el añadido después.

| Regla | Implementada en | Ausente en |
|---|---|---|
| Cuatro estados | BD + tipo | Servicio de flujo |
| Tope de carga | `claim` | `assign` |
| Alcance por organización | Lecturas | Escrituras |

**Pendiente y no ticketeado:** auditar el backend con esa misma lente — soft delete,
alcance por organización en otros módulos, guards de permiso, y DTOs que asuman camelCase.

---

## Trampas conocidas

- Los **mocks describen menos que el esquema**. `critical` no se maquetó; los estados van
  al revés (el mock dibuja «Cerrada» y el servicio no la admite). **Contrastar mock ↔
  esquema ↔ servicio antes de implementar**
- Un **servicio sin consumidor es un contrato sin verificar**. Precedente: SC-209 declaró
  `size_bytes` mientras el wire emitía `file_size`, y sobrevivió porque el test afirmaba
  sobre la URL en vez de sobre la carga
- Tras reseedear la base, **vaciar Redis** antes de probar login o menús

---

## Fuera de código

- **Revocar la API key de Firebase** del proyecto `auth-92411` (pertenece a un compañero
  del GeoReporta original) y cerrar la alerta #1 de GitHub como *revoked*
- **Purga del historial** de `GeoReporta/` pendiente de coordinar: sólo 2 commits la
  tocan (`3ad8267`, `db94337`), pero el primero está en casi todas las ramas. 2
  colaboradores. Reescribir **no** sustituye revocar la key

---

## Referencias

- Artefactos SDD: `openspec/changes/{front,back}/2026-08-29-*/`
- Reglas de formato: `openspec/config.yaml` (`strict_tdd: true`, `working_dir: backend`)
- Rol del arquitecto: `docs/agents/gemini-architect.md` — **lo ejecuta Claude desde
  2026-09-01** (se agotó el plan de Gemini). Salvaguardas del rol doble en
  `docs/agents/claude-qa.md`, sección «Rol doble»
- Mocks: `docs/mock/*.png`
- Índice del legacy (consultable, sin código): `GeoReporta/.codegraph/codegraph.db`
