# Handoff REVIEW Gemini CLI — F5: Tramo 1 (backend) + integraciones frontend (2026-09-14)

> **MODO REVIEW — NO implementar.** Este documento dejó de ser un handoff de
> implementación. El Tramo 1 (F5.1–F5.4) lo implementó el runtime nativo de OpenCode
> (modelo `opencode/mimo-v2.5-free`) y el 2026-09-14 se agregaron **dos fixes de
> frontend** (propagación de `children` + look plano del sidebar). Lo traés a Gemini CLI
> para **REVISAR el estado actual**, no para escribir código.
> Si encontrás algo que ajustar: **reportalo en el chat, no toques el working tree.**
> El registro vivo del Tramo 1 es `openspec/changes/back/2026-08-29-f5-dynamic-menus/apply-progress.md`;
> el ledger nativo `gentle-ai sdd-attempt` cerró el intento como `passed`.

> **Rol original (histórico)**: documento de handoff para que **Gemini CLI** implemente el
> Tramo 1 del change OpenSpec `back/2026-08-29-f5-dynamic-menus` (F5 — menús dinámicos
> administrables). El runtime nativo de OpenCode agotó la cuota free-tier del proveedor
> (`gemini-3.6-flash`, límite 20 req/día) para el dispatch de `sdd-apply`; este documento
> era el contexto canónico para el reemplazo externo. Creado: 2026-09-14.

---

## 1. Estado original PRE-implementación (histórico, solo contexto — no refleja el working tree)

> **ACTUALIZADO 2026-09-14 — el estado de abajo NO es el estado vivo.**
> El runtime nativo implementó el Tramo 1 completo (25 tareas `[x]`, `apply-progress.md`,
> migraciones 0054/0055 aplicadas a docker, ledger cerrado `passed`). El registro vivo es
> `apply-progress.md`, no este documento. Conservamos el estado original a modo de
> bitácora histórica.

- **Rama**: `carlos_fp/sc-307/f5-menus-dinamicos-crud-en-bd-con-matriz`
- **Planning completo**: `proposal.md`, `specs/dynamic-menus/spec.md`, `design.md` y
  `tasks.md` existen y están aprobados. No hay NADA implementado aún: las 31 tareas están
  en `[ ]` y NO existe `apply-progress.md`.
- **Working tree**: limpio salvo `.atl/skill-registry.md`, `.atl/.skill-registry.cache.json`
  (modificados, NO los toques) y `scratch/` (sin trackear, NO lo toques).
- **No ejecutes `git add`/`commit`/`push` ni crees PRs.** El humano commitea. Dejá todo en
  el working tree.
- El ledger nativo `gentle-ai sdd-attempt` registra 2 intentos `interrupted` (0 líneas
  cambiadas, 0 archivos tocados) por el bloqueo de cuota. No lo uses para este tramo.

## 1b. QUÉ SE HIZO EL 2026-09-14 — ESTO ES LO QUE TENÉS QUE REVISAR

### A. Tramo 1 backend (F5.1–F5.4) — implementado por el runtime nativo

- 25 tareas `[x]` en `tasks.md`; `apply-progress.md` creado (registro vivo).
- Migraciones **0054** (`4a5bfb5e0728…`) + **0055** (`d5a7ff25323c…`) + DOWN rollbacks en
  `database/rollback/`. **Aplicadas a la BD docker local** (`tase-postgres`, vía psql +
  registro en `schema_migrations`). En Supabase quedan `⏳ Pending` — fuera de este review.
- Entidades nuevas: `menu-option`, `menu-option-role`, `api-endpoint`,
  `menu-option-endpoint`. `menus.service.ts` reescrito (resolución desde BD, árbol en
  memoria por `parent_id`, caché `menu:v1:role:{roleId}` TTL 1h, invalidación `menu:v1:*`).
  `menus.module.ts` con `forFeature`.
- Datos verificados en docker: 13 `menu_options`, 46 `menu_option_roles`, 56
  `api_endpoints`; árbol completo visible para `master` y `operador_sistema`.
- Gates backend al cerrar el tramo: lint 0 errores, typecheck OK, 115 suites / 1076 tests
  PASS. **e2e NO corrido** (Testcontainers/Ryuk vs `/var/run/docker.sock` — infra, no código).
- `MIGRATION_LOG.md` filas 121–122 → `✅ Applied` (docker local).

### B. Fix 1 — el sidebar perdía todos los sub-ítems (integración F5.6 parcial)

**Síntoma**: con el backend F5 corriendo, el sidebar mostraba solo `dashboard`, `incidencias`,
`gestion` y `catalogos` — los 4 roots, sin hijos.

**Diagnóstico (verificado en caché Redis `menu:v1:role:*`)**: el backend devolvía el árbol
anidado CORRECTO; el frontend `transformBackendMenu()` (F1-era) pisaba `children: []` porque
fue escrito para el contrato plano F1 y no declara/propaga `children` (F5 añadió el array
anidado, D1).

**Fix aplicado** (`frontend/src/app/core/services/`):
- `menu.service.ts`: `BackendMenuItem.children?: BackendMenuItem[]` + `transformBackendMenu`
  propaga hijos recursivamente (ids únicos por árbol + `parent_menu_id`).
- Test TDD nuevo en `menu.service.spec.ts` (`transforms nested children from the F5 backend
  contract (F5.6)`) — escrito primero (RED), pasa tras el fix.

### C. Fix 2 — decisión de producto: look original plano (sin desplegables)

**Requerimiento del usuario**: "los menús deberían quedar como estaban en su forma original
antes de aplicar el spec" — todos los enlaces visibles, separados por menú padre; NO ocultos
en listas desplegables.

**Implementación** (`frontend/src/app/layout/sidebar/`):
- `sidebar.component.ts` → `groupedMenuItems()` aplana encabezados de sección: un nodo **sin
  ruta** con hijos (INCIDENCIAS/GESTIÓN/CATÁLOGOS) renderiza sus hijos como **links planos
  visibles** bajo el label del padre; los nodos con ruta propia siguen siendo items normales.
  `MenuItem.children` se mantiene poblado (F5.6.8) — el árbol del CRUD admin lo consume
  aparte.
- Tests nuevos en `sidebar.spec.ts` (bloque "F5 flatten"): hijos visibles sin expandir,
  orden plano, hijos son `<a>` reales, el encabezado NO es botón.
- Decisión documentada en `design.md` (§ "F5.6 — Sidebar presentation decision").

### D. Gates frontend al cierre (2026-09-14 20:39)

- `pnpm exec jest --runInBand` → **88 suites / 615 tests PASS**
- `pnpm run build` → OK (bundle generado)

### E. Pendientes explícitos (lo que este review NO puede probar)

1. **Validar en el navegador** que el sidebar muestre el look original plano (recargar
   frontend con backend F5 arriba en `localhost:3001`).
2. **e2e del backend** no corridos (infra Testcontainers; reportar, no silenciar).
3. Migraciones 0054/0055 **en Supabase**: `⏳ Pending` (solo docker local aplicado).
4. **`parentId` leak** en el wire del backend — **CORREGIDO 2026-09-14 (review Gemini, finding 1)**: `buildTree` usa ahora un wrapper interno `{ entry, parentId }` en vez de extender el DTO; test de regresión en `menus.service.db-resolution.spec.ts` ("does NOT leak parentId/parent_id into the wire"). Backend: 115 suites / 1077 tests PASS.
5. **Nota de navegación**: `MENU_MAP` tiene 10 entradas con ruta (el texto de tasks decía
   "once" — aproximación).

## 2. REQUISITOS EXPLÍCITOS (mandan sobre cualquier otra interpretación)

1. **Orden no negociable** (tasks.md): esquema → migración de datos → **lectura desde base
   de datos con el contrato intacto** → recién entonces CRUD y pantalla. Este tramo cubre
   el primer bloque: NO implementes F5.5 (CRUD), F5.6 (frontend) ni F5.7 (cierre).
2. **El contrato de `GET /api/menus/my` NO cambia** (D1): la respuesta sigue emitiendo
   `{ label, route, icon?, group?, order }` más `children`. No aproveches la reescritura
   para «mejorar» la forma.
3. **`menu-map.ts` permanece en el repositorio** (D7), marcado como origen histórico. Es la
   vía de reversión. NO lo borres ni lo vacíes.
4. **Strict TDD activo**: test primero (verlo fallar) → implementar → verlo pasar, en todo
   el backend de este tramo. Sin excepciones.

## 3. Alcance del Tramo 1 — tareas a completar

Del archivo `openspec/changes/back/2026-08-29-f5-dynamic-menus/tasks.md`, marcá `[x]`
SOLO estas tareas:

### F5.1 — Migración de esquema
- **F5.1.1** — Reservar numeración en `database/MIGRATION_LOG.md` (ver gotcha de colisión abajo).
- **F5.1.2** — Crear `menu_options`: `id` uuid PK, `name`, `route`, `icon` NULL,
  `parent_id` uuid NULL FK autorreferencia, `display_order` int, `is_active` bool,
  `deleted_at` timestamptz NULL; índice sobre `(parent_id, display_order)`.
- **F5.1.3** — Crear `menu_option_roles`: PK compuesta `(menu_option_id, role_id)`,
  `can_read` bool, `can_write` bool.
- **F5.1.4** — Crear `api_endpoints`: `id` uuid PK, `method`, `path`, `description`,
  `UNIQUE (method, path)`.
- **F5.1.5** — Crear `menu_option_endpoints`: PK compuesta `(menu_option_id, endpoint_id)`.
- **F5.1.5b** — Añadir `roles.scope varchar(20) NOT NULL DEFAULT 'organization' CHECK
  (scope IN ('platform','organization','public'))`; luego
  `UPDATE roles SET scope='platform' WHERE name IN ('master','operador_sistema')` y
  `UPDATE roles SET scope='public' WHERE name='reporter'` (Q1 resuelta en design.md).
  **`roles` NO tiene `organization_id`** — verificado contra `0001_initial_schema.sql`:
  catálogo global con `name` único; `organization_id` vive en `users`. Son **cinco** roles,
  no cuatro: `reporter` (el ciudadano) se siembra en 0009 y `users.js` no crea ningún
  usuario con él.
- **F5.1.6** — Registrar los permisos `READ|CREATE|UPDATE|DELETE menu-options` en el
  catálogo y asignarlos: lectura a `master` y `operador_sistema`; escritura sólo a `master`.
- **F5.1.7** — Actualizar `roles.permissions` **y** `users.permissions` de los usuarios
  preexistentes (mismo patrón que F4: tocar sólo `roles` deja a los usuarios actuales sin
  los permisos nuevos).
- **F5.1.8** — Sembrar `api_endpoints` con las rutas actuales de la aplicación (D5).
- **F5.1.9** — Añadir las entradas correspondientes a `database/MIGRATION_LOG.md`.

### F5.2 — Migración de datos
- **F5.2.1** — Trasladar las once entradas de `MENU_MAP` (`backend/src/modules/menus/menu-map.ts`)
  a filas de `menu_options`, preservando `route`, `icon` y `display_order`.
- **F5.2.2** — Derivar `menu_option_roles` desde el `requires` actual: cada rol que posee
  ese permiso obtiene `can_read = true`; `can_write` se deriva de si el rol tiene el
  permiso de escritura del recurso.
- **F5.2.3** — Mapear el `group` actual (`INCIDENCIAS`, `GESTIÓN`, `CATÁLOGOS`): decidí si
  se conserva como columna o se deriva de la jerarquía padre/hijo, y **documentá la
  elección** (nota en `design.md` sección `## Implementation notes`, o en el
  `apply-progress.md`; inglés técnico).
- **F5.2.4** — **Conservar `menu-map.ts` en el repositorio** (D7), marcado como origen
  histórico.

### F5.3 — Entidades
- **F5.3.1** — `menu-option.entity.ts`: autorreferencia `parent`/`children`, borrado
  lógico con `deleted_at` (D6).
- **F5.3.2** — `menu-option-role.entity.ts`: PK compuesta, borrado físico (D6).
- **F5.3.3** — `api-endpoint.entity.ts` y `menu-option-endpoint.entity.ts`.

### F5.4 — Resolución (el tramo de riesgo)
- **F5.4.1** — Specs primero: filtrado por `can_read`; exclusión de `is_active = false` y
  `deleted_at` no nulo; orden por `display_order`; **hijo oculto cuando su padre no es
  accesible**.
- **F5.4.2** — Reescribir `menus.service.ts` para resolver desde base de datos manteniendo
  **exactamente** el contrato `{ label, route, icon?, group?, order }` más `children` (D1).
- **F5.4.3** — Armar el árbol en memoria por `parent_id` (D3), misma técnica que
  `tree.util.ts` de F2.
- **F5.4.4** — **Test de paridad (la aserción central)**: tras la migración, la salida de
  `GET /api/menus/my` para `master@tase.local` coincide con la que producía `MENU_MAP`.
- **F5.4.5** — Adaptar `menu-map.spec.ts` (D8) para validar las rutas de `menu_options`
  contra `app.routes.ts`. NO descartarlo: es la defensa contra la regresión de F1.
- **F5.4.6** — Caché `menu:v1:role:{roleId}` con TTL de 1 hora (D4). Anotar en el código
  que este espacio de claves **no** tiene relación con `perm:v3:uid:*`.
- **F5.4.7** — Invalidación de `menu:v1:*` completo ante cualquier escritura de menú.
- **F5.4.8** — Test de caché: dos lecturas seguidas no repiten consulta; una escritura invalida.

**FUERA DE ALCANCE de este tramo (NO implementar):** F5.5 (CRUD/controller), F5.6
(frontend — NO toques `frontend/`), F5.7 (cierre/e2e). Tampoco toques el módulo
`backend/src/modules/roles` más allá de la columna `scope` y los permisos de la migración
F5.1.6/F5.1.7.

## 4. Decisiones de arquitectura ya tomadas (NO las cambies)

- **D1 — Contrato intacto.** `MenuService`, `menuResolver` y el sidebar del frontend no se
  tocan. Mezclar cambio de origen con cambio de forma haría imposible atribuir una regresión.
- **D2 — Matriz convive con permisos, no lo reemplaza.** `users.permissions` gobierna la
  API; `menu_option_roles` gobierna la navegación. Dos lugares de configuración de acceso,
  deliberado y documentado.
- **D3 — Jerarquía por autorreferencia, resuelta en memoria** por `parent_id` (técnica de
  `tree.util.ts` de F2). Nada de CTE recursiva ni `ltree`.
- **D4 — Caché Redis `menu:v1:role:{roleId}`, TTL 1h, invalidación `menu:v1:*` completa al
  escribir.** Espacio SEPARADO de `perm:v3:uid:*`. Confundirlos ya costó depuración.
- **D5 — Catálogo de endpoints poblado por semilla, con test de divergencia** contra las
  rutas registradas (falla si divergen). Sin descubrimiento automático (Q2, fuera de alcance).
- **D6 — Borrado lógico en `menu_options` (`deleted_at`); físico en las tablas de unión**
  (`menu_option_roles`, `menu_option_endpoints`).
- **D7 — Migración de datos reversible por construcción:** `menu-map.ts` permanece.
- **D8 — El test de coherencia de F1 se adapta, no se descarta.**
- **Q1 (resuelta)**: `roles.scope` con tres valores (`platform`, `organization`, `public`).
- **Q5 (resuelta, informativa)**: el usuario anónimo NO aparece en la matriz de menú: no es
  una fila de `roles`; sus permisos salen de `auth.config.ts` (`anonymousPermissions`).
  No lo agregues a ninguna consulta de roles.

## 5. Gotchas conocidos (evítalos)

- **Colisión de numeración de migraciones**: F4 se renumeró de 0049→0053 porque 0049 ya
  estaba ocupada (`0049_admin_user_permissions.sql`, F6). Al reservar numeración leé TODO
  `database/MIGRATION_LOG.md` y verificá contra los archivos `database/migrations/` (no
  confíes solo en el log).
- **`menu:v1:*` ≠ `perm:v3:uid:*`**: son dos espacios de claves independientes. Vaciar uno
  no afecta al otro. No los acoples.
- **Testcontainers bajo podman**: si los e2e no arrancan contenedores, es infra (Ryuk vs
  `/var/run/docker.sock`), no tu código. Reportalo, no lo silencies.
- El dispatcher nativo `gentle-ai sdd-status/continue` NO resuelve el layout con scope de
  este repo (`openspec/changes/back/...`); trabajá directamente sobre los paths de esta
  change, no sobre el binary.
- `backend/` usa npm (no pnpm). Los gates backend son: `npm run lint && npm run typecheck
  && npm test && npm run test:e2e`.

## 6. Artefactos a leer ANTES de implementar

- `openspec/changes/back/2026-08-29-f5-dynamic-menus/proposal.md`
- `openspec/changes/back/2026-08-29-f5-dynamic-menus/specs/dynamic-menus/spec.md`
  (REQUIREMENTS + SCENARIOS: resolución, jerarquía, matriz, CRUD, endpoints, caché)
- `openspec/changes/back/2026-08-29-f5-dynamic-menus/design.md` (D1–D8, Data Flow, File
  Changes, Redis Caching Strategy, Q1/Q5)
- `openspec/changes/back/2026-08-29-f5-dynamic-menus/tasks.md` (solo F5.1–F5.4)
- `database/MIGRATION_LOG.md` y `database/migrations/` (numeración + patrón de migración)
- Código existente (referencia de patrones):
  - `backend/src/modules/menus/menu-map.ts` — las once entradas a migrar
  - `backend/src/modules/menus/menus.service.ts`, `menu-resolver.ts`, `menu-map.spec.ts`
  - `backend/src/modules/permissions/` (PermissionLookupService) y el patrón de propagación
    de permisos F4 en `database/migrations/`
  - `backend/src/modules/locations/tree.util.ts` (técnica de árbol por `parent_id` de F2)
- Skills de referencia (leer antes de escribir código):
  - `/home/carlosfpatino/.config/opencode/skills/work-unit-commits/SKILL.md`
  - `/home/carlosfpatino/.config/opencode/skills/chained-pr/SKILL.md`

## 7. Reglas duras

1. **Strict TDD**: specs de test primero → verlos fallar → implementar → verlos pasar.
2. **NO `git add`/`commit`/`push`** ni PRs. El humano commitea. Working tree listo, sin
   staging residual.
3. **NO tocar** F5.5, F5.6 (frontend), F5.7, ni módulos ajenos al alcance.
4. Idioma: **código, comentarios, migraciones y `apply-progress.md` en inglés técnico
   neutro**. No inventes convenciones; seguí las del código existente.
5. Conservá `menu-map.ts` marcado como origen histórico (D7).
6. Marcá `[x]` en `tasks.md` SOLO las tareas F5.1.*–F5.4.* que completes.

## 8. Verificación obligatoria (desde `backend/`)

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

Tramo 1 se considera éxito con los cuatro gates verdes (si un gate falla por causas
pre-existentes ajenas a tu cambio, reportalo como riesgo, no lo arregles en silencio ni
claims verdes).

## 9. Entregable al terminar

- Código en el working tree, tests verdes, tasks F5.1–F5.4 marcadas `[x]`, y
  `openspec/changes/back/2026-08-29-f5-dynamic-menus/apply-progress.md` creado (F5.1–F5.4
  con evidencia; F5.5–F5.7 pendientes).
- Reportame (en chat, no commits): resumen de lo implementado, resultado del test de
  paridad, elección del manejo de `group` (F5.2.3), decisiones clave y desviaciones,
  comandos de test corridos con resultados reales, gotchas encontradas, y la agrupación
  por work unit de los archivos para que el orquestador pueda redactar los bloques de
  commit que el humano copiará y pegará.