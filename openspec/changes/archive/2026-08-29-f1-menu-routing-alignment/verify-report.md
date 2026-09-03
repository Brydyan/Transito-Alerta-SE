# Verification Report

**Change**: `2026-08-29-f1-menu-routing-alignment` (story sc-303)
**Pasada**: 1 (primera)
**Mode**: Strict TDD
**Árbol**: sin commitear, verificado contra working tree (no HEAD)

---

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 20 |
| Tasks complete (marcadas `[x]`) | 0 |
| Tasks incomplete (marcadas `[ ]`) | 20 |
| Tasks con evidencia de código real de que se hicieron | 20 (verificado contra `apply-progress.md` + lectura de código) |

`tasks.md` nunca se actualizó para reflejar el cierre — ver WARNING-1 en `fixes-required.md`. El trabajo descrito SÍ está en el código (verificado línea por línea abajo), pero el archivo de control de tareas miente sobre su propio estado.

---

### Build & Tests Execution

**Backend — `npm test`**: ✅ **97/97 suites, 882/882 tests** (ejecución real, confirmado)

**Frontend — `rtk jest`**: ✅ **223/223 passed** (ejecución real, confirmado)

**Backend lint (`npm run lint`)**: ✅ 0 errors, 19 warnings — los 19 son preexistentes en 5 archivos que F1 no toca (`mail/*.spec.ts`, `notifications.controller.spec.ts`, `events.gateway.spec.ts`, `users.service.spec.ts`).

**Frontend lint**: ➖ No hay script `lint` en `frontend/package.json` — ver SUGGESTION-1.

**Frontend typecheck (`npx tsc -b tsconfig.json --noEmit`)**: exit code **2** (confirmado con exit code real, no con el pipe a `tail`). 15 errores, todos preexistentes y ajenos a F1:
- `auth.interceptor.regression.spec.ts`, `layout-tokens.regression.spec.ts`, `sidebar.spec.ts`, `contrast.regression.spec.ts`: `node:fs`/`node:path`/`__dirname` sin `@types/node` (patrón compartido por specs de regresión hermanos, ninguno tocado por F1).
- `auth.service.spec.ts:227`: `TS2345` real, preexistente, no relacionado con menús.
Ningún error nuevo en archivos que F1 modifica o crea (`menu.service.ts`, `menu.service.spec.ts`, `app.routes.ts`, `features/placeholder/`).

**Backend typecheck**: confirmado que `backend/tsconfig.json` NO usa `references`/`files:[]` — `-p` y `-b` producen **output idéntico** (diff vacío salvo la línea de comando en el log de npm), ambos exit 0. No hay trampa de falso-verde acá.

**Build (`ng build`)**: no se re-ejecutó en esta pasada (apply-progress reporta verde, 5.2s); no es la prioridad de esta verificación dado que hay dos CRITICAL más urgentes.

---

### Ejecución en vivo — mutaciones y reversión (evidencia central de esta pasada)

Tres experimentos, cada uno revertido y confirmado con `diff` byte a byte contra un backup antes de continuar:

1. **Se borró el bloque de ruta `/incidencias` de `app.routes.ts`** (ruta real de Angular) → se corrió `menu-map.spec.ts` del backend sin tocar nada más → **5/5 verdes**. El test de "coherencia" no notó la eliminación de una ruta real. Revertido y confirmado idéntico al original.
2. **Se agregó `Ghost` a `MENU_MAP` con una ruta inexistente**, sin registrarla en `app.routes.ts` ni en `KNOWN_APP_ROUTES` → el test **sí falló** (detectó el offender). Esto probaba que el mecanismo de comparación en sí funciona.
3. **Se agregó la misma ruta ficticia a `KNOWN_APP_ROUTES`** (la lista hand-maintained, en el mismo archivo del spec de backend) sin tocar `app.routes.ts` → **5/5 verdes de nuevo**, con una entrada de menú apuntando a una ruta que Angular nunca registró. Revertido y confirmado.
4. **Se montó `PlaceholderComponent` exactamente como lo haría el router** (`TestBed.createComponent` + `detectChanges()`, sin bindings de `title`/`phase`, replicando `provideRouter(routes)` sin `withComponentInputBinding()`) → **lanzó `NG0950`**. Archivo de prueba temporal creado y eliminado tras confirmar el resultado; `git status` limpio al terminar.

Los cuatro experimentos son la base de CRITICAL-1 y CRITICAL-2 en `fixes-required.md`.

---

### Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| D3/D4 — `MenuEntry` con `group`/`order` | Propaga `group`/`order`, orden ascendente, grupos vacíos omitidos | `backend/.../menus.service.spec.ts` (8 tests) | ✅ COMPLIANT |
| D3/D4 — Cliente propaga `group` | `transformBackendMenu` propaga `group`, tolera ausencia | `frontend/.../menu.service.spec.ts` (6 tests) | ✅ COMPLIANT |
| D6 — Coherencia menú↔rutas (entregable central) | "Toda `route` de `MENU_MAP` es un `/app/*` real" | `backend/.../menu-map.spec.ts` | ❌ **FAILING la garantía, aunque el test PASA** — ver CRITICAL-2. El test pasa pero no mide lo que el requisito exige (no cruza a `app.routes.ts`) |
| D2 — Placeholder navegable para destinos pendientes | Ruta placeholder monta un estado "en construcción" | (ninguno — no existe spec de `PlaceholderComponent` en el change) | ❌ **UNTESTED, y de hecho FALLA** — ver CRITICAL-1 (`NG0950` reproducido con `TestBed`) |
| F1.5.3 — `citizen-report` alcanzable | Ruta `/reportar` monta `CitizenReportComponent` | `app.routes.ts:172-179` (estructural); sin unit test dedicado | ⚠️ PARTIAL — código correcto, sin test que lo confirme fuera del e2e (que se salta) |
| F1.5.4 — elimina duplicado `path: 'Reportes'` | grep en cero | Confirmado por lectura: no aparece en `app.routes.ts` actual | ✅ COMPLIANT (estructural) |
| F1.6.1/F1.6.2 — e2e sidebar sin 404 | Recorrer sidebar autenticado, sin `ErrorPageComponent` | `frontend/e2e/menu-navigation.e2e.ts` | ⚠️ PARTIAL/SKIPPED — se salta sin `BASE_URL`; no ejecutado en esta pasada; ver WARNING-3. Aun si corriera, no detectaría CRITICAL-1 (ver nota en fixes-required.md) |
| W-4 (F0) — `group` no se popula, cierre en F1 | Backend envía `group`, cliente lo propaga, sidebar agrupa | `menus.service.spec.ts` + `menu.service.spec.ts` + lectura de `sidebar.component.ts:76-91` | ✅ COMPLIANT — cadena completa confirmada extremo a extremo (declaración → propagación → agrupación visual) |

**Compliance summary**: 3/8 plenamente compliant, 2 CRITICAL, 2 PARTIAL, 1 UNTESTED-y-falla.

---

### Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| `MenuEntry`/`MenuDefinition` con `group?`/`order` (D3) | ✅ Implementado | `menu-map.ts:1-27` |
| `MENU_MAP` reescrito, 10 entradas D4, español | ✅ Implementado | Coincide con `design.md` D4 exactamente |
| `Assignments`/`Comments` retirados | ✅ Implementado | Confirmado por test dedicado y grep |
| `MenusService` propaga y ordena | ✅ Implementado | `menus.service.ts:35-51` |
| Coherencia menú↔rutas (D6) | ❌ No cumple la garantía | Ver CRITICAL-2 |
| Placeholders navegables (D2) | ❌ No cumple | Ver CRITICAL-1 — crashean con `NG0950` |
| `citizen-report` enganchado | ✅ Implementado | `app.routes.ts:172-179` |
| `path: 'Reportes'` eliminado | ✅ Implementado | Confirmado ausente |
| Caché `perm:v3:*` vs `menu:v1:*` | ✅ No aplica cambio | No existe ninguna clave `menu:v1:*` en el repo; el menú nunca se cacheó, confirmado por grep. Diseño correcto en no requerir invalidación |
| Contrato del frontend deriva del controlador, no del DTO | ✅ Confirmado | `menus.controller.ts` retorna `MenuEntry[]` con los campos ya en el shape esperado; `SnakeCaseResponseInterceptor` no transforma nada relevante (los campos ya son snake/flat) |

---

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 — `MENU_MAP` estático | ✅ Sí | No se adelantó F5 |
| D2 — Placeholders por ruta | ⚠️ Implementado pero roto | El patrón se siguió (componente reusa `empty-state`) pero la integración con el router tiene el bug de CRITICAL-1 |
| D3 — `order` obligatorio | ✅ Sí | Tipo y tests lo confirman |
| D4 — Mapa de 10 entradas | ✅ Sí, coincide con la tabla | Pero `tasks.md` sigue diciendo 11 — WARNING-2 |
| D5 — Rutas conservadas (`/admin/users`, `/admin/roles`) | ✅ Sí | Sin cambios |
| D6 — Test de coherencia como entregable central | ❌ No cumple su propósito | CRITICAL-2 |

---

### Issues Found

**CRITICAL** (must fix before archive):
1. `PlaceholderComponent` lanza `NG0950` al montarse vía router — 6 de las 10 rutas del menú no renderizan el placeholder prometido por D2. Ver CRITICAL-1 en `fixes-required.md`.
2. `menu-map.spec.ts` (D6) no cruza la frontera backend↔frontend; compara `MENU_MAP` contra una copia hand-maintained de sí mismo en el mismo archivo, no contra `app.routes.ts`. No puede detectar la divergencia que fue creado para prevenir — reproducido en ambas direcciones con mutación en vivo. Ver CRITICAL-2.

**WARNING** (should fix):
1. `tasks.md`: 20/20 tareas sin marcar `[x]` pese al cierre documentado en `apply-progress.md`.
2. Conteo de entradas del mapa: `tasks.md` dice 11, `design.md` dice 10, sin resolver formalmente (sólo anotado).
3. El e2e que podría (parcialmente) compensar CRITICAL-2 nunca corre localmente y su ejecución en CI depende de una variable (`vars.STAGING_BASE_URL`) que no se pudo confirmar desde este entorno.

**SUGGESTION** (nice to have):
1. `tasks.md` F1.6.3 exige `pnpm lint` desde `frontend/`; el script no existe en `package.json`.

---

### Verdict

**FAIL**

Dos CRITICAL bloquean archive. El primero (`NG0950`) es un defecto funcional real y reproducible: 6 de los 10 destinos del sidebar no renderizan nada utilizable hoy — el síntoma original (clic roto) no se resolvió para esos destinos, cambió de forma. El segundo es estructural sobre el entregable central de la fase: el test que se supone es "la garantía duradera contra la reincidencia" no ejerce esa garantía porque nunca lee el archivo que dice comparar. Ambos se reprodujeron con ejecución real (no lectura) y se revirtieron limpiamente antes de cerrar esta pasada.

Recomendación: **no archivar.** Devolver a `sdd-apply` con los dos CRITICAL de `fixes-required.md`.

---
---

# Verification Report — Pasada 2

**Change**: `2026-08-29-f1-menu-routing-alignment` (story sc-303)
**Pasada**: 2 (segunda)
**Mode**: Strict TDD
**Árbol**: sin commitear, verificado contra working tree (no `HEAD`)

> Contexto limpio a propósito (salvaguarda de rol doble). Cada hallazgo se
> verificó con ejecución real y, para CRITICAL-2, con mutación en vivo
> revertida — no se tomó `apply-progress.md` como fuente de verdad.

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 20 |
| Tasks complete (`[x]`) | 20 |
| Tasks incomplete (`[ ]`) | 0 |

`tasks.md` ya refleja el cierre real — confirmado con `grep -c` propio, no
por lectura de `apply-progress.md`.

---

## Build & Tests Execution (ejecución real, esta pasada)

**Backend — `npm test`**: ✅ **97/97 suites, 883/883 tests**

**Frontend — `npx jest`**: ✅ **36/36 suites, 227/227 tests** (sube de 223 a
227: los 4 tests nuevos de `placeholder.component.spec.ts`)

**Backend typecheck (`npx tsc --noEmit -p tsconfig.json`)**: ✅ exit 0, sin
errores. Confirmado (pasada 1 ya había establecido que `-p` y `-b` son
equivalentes en backend).

**Frontend typecheck (`npx tsc -b tsconfig.json --noEmit`)**: exit 2, **18
errores** (subió de 15 a 18 — ver WARNING nuevo abajo). Los 15 preexistentes
siguen siendo ajenos a F1 (mismos archivos que en pasada 1). Los 3 nuevos
vienen de `placeholder.component.spec.ts`, archivo nuevo de esta ronda, y
replican el mismo gap (`node:fs`/`__dirname` sin `@types/node`) que ya
tienen sus specs hermanos — no bloqueante pero formalmente "archivo tocado
por F1 aporta errores nuevos".

**Frontend lint**: ➖ sigue sin existir el script — SUGGESTION persiste.

---

## CRITICAL-1 (pasada 1) — Verificado CERRADO con evidencia propia

Tres fuentes de evidencia independientes, todas de esta pasada:

1. **`placeholder.component.spec.ts`** (nuevo, del apply): 4/4 tests
   verdes, incluyendo un test de regresión que reproduce `NG0950` con
   `TestBed` sin bindings (prueba que el bug sigue siendo ruidoso si el
   binding se retira) y dos tests de "cableado de producción" que leen
   `app.config.ts` y `app.routes.ts` literalmente.
2. **Prueba propia con `TestBed` directo** (`fixture.detectChanges()` sin
   bindings, replicando exactamente el bug original): confirmado que
   sigue lanzando si se remueven los bindings — el componente en sí no
   cambió su contrato (`title`/`phase` siguen `input.required`).
3. **Prueba propia con navegación real de router** (`RouterTestingHarness`
   + `provideRouter(placeholderRoutes, withComponentInputBinding())`,
   extrayendo las 6 rutas placeholder reales de `app.routes.ts` y
   montándolas fuera del guard de `/app` para no depender de auth):
   navegación a `/inicio`, `/incidencias`, `/mapa`, `/organizaciones`,
   `/categorias`, `/ubicaciones` — **las 6 renderizan sin lanzar**, con el
   `title`/`phase` correctos en el DOM (`"Lista de Incidencias" ...
   "Esta pantalla llega en la fase F3 del roadmap."`, etc.). Archivo de
   prueba temporal (`frontend/src/app/__verify_probe__.spec.ts`) creado y
   eliminado tras confirmar; `git status` limpio.

`app.config.ts` diff confirmado mínimo: sólo el import de
`withComponentInputBinding` y su uso como segundo argumento de
`provideRouter`. Se buscaron colisiones de nombre entre inputs de
componentes ruteados existentes (`id`, `rolId`, `breadcrumb`) — ninguna
encontrada, así que habilitar el binding globalmente no altera el
comportamiento de otras rutas ya existentes.

**Veredicto CRITICAL-1: CERRADO.**

---

## CRITICAL-2 (pasada 1) — NO CERRADO. Foco principal de esta pasada.

Ver `fixes-required.md` para el detalle completo con líneas exactas. Resumen:

- **Dirección 1** (ruta real borrada de `app.routes.ts`): **ahora sí
  detecta la divergencia** — mejora real respecto a pasada 1 (que daba
  5/5 verde). Confirmado con mutación en vivo (`incidencias` borrado →
  test falla con `missing: ["incidencias"]`) y reversión limpia.
- **Dirección 2** (ruta fantasma agregada a `MENU_MAP` y "confirmada" a
  mano en `KNOWN_APP_ROUTES`, sin tocar `app.routes.ts`): **sigue
  poniendo el test en verde.** Confirmado con mutación en vivo (`Ghost`
  con `/ghost-not-registered`, agregado también a `KNOWN_APP_ROUTES` →
  `-t "CRITICAL-2: every MENU_MAP route"` → PASS) y reversión limpia.

El mecanismo de escape sigue existiendo: el `continue` que salta la
validación cuando `KNOWN_APP_ROUTES.has(full)` no está condicionado a que
la ruta sea parametrizada, pese a que el docblock y el mensaje de error
del test dan a entender que la lista es sólo para eso. El segundo test
("dirección 2" del propio spec, línea 155) sólo verifica el sentido
inverso (toda ruta parametrizada del `MENU_MAP` está en la lista), nunca
que las entradas de la lista sean legítimas.

**Veredicto CRITICAL-2: NO CERRADO.** El entregable central de F1 (D6)
sigue sin cumplir la garantía que promete: "el test que debe fallar si
menú y rutas vuelven a divergir" puede ponerse en verde con una
divergencia real con una sola línea agregada al mismo archivo del test.

---

## WARNINGS de pasada 1 — estado

| # | Hallazgo | Estado pasada 2 |
|---|----------|------------------|
| 1 | `tasks.md` 20/20 sin marcar | ✅ Resuelto — 20/20 marcados, confirmado con `grep -c` propio |
| 2 | Conteo 10 vs 11 (`tasks.md` vs `design.md`) | ✅ Resuelto — `tasks.md:31,38` ahora dicen 10, coincide con `design.md` D4 y la implementación |
| 3 | e2e depende de `BASE_URL`, `assertNotErrorPage` no detecta render vacío | ⚠️ Persiste sin cambios — ver `fixes-required.md`. Menos urgente ahora que CRITICAL-1 cerró, pero la debilidad estructural del gate no se tocó |

## Hallazgos nuevos de pasada 2

| Severidad | Hallazgo |
|---|---|
| WARNING | `placeholder.component.spec.ts` (nuevo) aporta 3 errores nuevos en el typecheck `-b` del frontend (18 vs 15 preexistentes), mismo patrón `node:fs`/`__dirname` que specs hermanos |
| SUGGESTION | El parser de D6 valida por segmentos sueltos, no por jerarquía real de rutas — debilidad estructural, sin caso concreto que la dispare hoy |

## SUGGESTION de pasada 1 — estado

`pnpm lint` ausente en `frontend/package.json`: sin cambios, decisión
documentada explícitamente en `apply-progress.md` de no resolverlo ahora.

---

### Verdict — Pasada 2

**FAIL**

Un CRITICAL sigue abierto: CRITICAL-2, el entregable central de la fase
(D6, "el test que impide la reincidencia"), todavía puede ponerse en verde
con una entrada de `MENU_MAP` que apunta a una ruta que Angular nunca
registró — basta con espejar la ruta fantasma en `KNOWN_APP_ROUTES`, el
mismo archivo del test. Reproducido con mutación en vivo y revertido
limpiamente. CRITICAL-1 sí cerró, confirmado con tres fuentes de evidencia
independientes incluyendo navegación real de router construida para esta
verificación.

Recomendación: **no archivar.** Devolver a `sdd-apply` con CRITICAL-2 de
`fixes-required.md`. El fix debe cerrar la dirección 2 sin reabrir la
dirección 1: o bien restringir automáticamente `KNOWN_APP_ROUTES` a rutas
genuinamente parametrizadas (con un test que lo haga cumplir), o eliminar
la lista y resolver la jerarquía real de `app.routes.ts`.

---
---

# Verification Report — Pasada 3

**Change**: `2026-08-29-f1-menu-routing-alignment` (story sc-303)
**Pasada**: 3 (tercera)
**Mode**: Strict TDD
**Árbol**: sin commitear, verificado contra working tree (no `HEAD`)

> Contexto limpio a propósito (salvaguarda de rol doble). Ningún hallazgo de
> esta pasada se apoya en `apply-progress.md` como fuente de verdad — cada
> uno se reprodujo con lectura de código y, para CRITICAL-2 y CRITICAL-1,
> con ejecución/mutación real construida en esta pasada y revertida después.

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 20 |
| Tasks complete (`[x]`) | 20 |
| Tasks incomplete (`[ ]`) | 0 |

Confirmado con `grep -c` propio sobre `tasks.md`. Sin cambios respecto a pasada 2.

---

## Build & Tests Execution (ejecución real, esta pasada)

**Backend — `npm test`**: PASS — **97/97 suites, 883/883 tests**

**Frontend — `npx jest`**: PASS — **36/36 suites, 227/227 tests**

**Backend lint (`npm run lint`)**: 0 errors, 19 warnings — mismos 19 preexistentes en 3 archivos que F1 no toca (`events.gateway.spec.ts`, `users.service.spec.ts`; ver detalle en pasadas previas).

**Frontend typecheck (`npx tsc -b tsconfig.json --noEmit`)**: exit 0 salvo errores, **14 errores** (bajó de 18 en pasada 2 a 14). Confirmado con conteo propio (`grep -c "error TS"`). Los 14 son los mismos preexistentes de siempre (`auth.interceptor.regression.spec.ts` x3, `auth.service.spec.ts:227` x1, `layout-tokens.regression.spec.ts` x4, `sidebar.spec.ts` x3, `contrast.regression.spec.ts` x3) — **cero** provienen de `placeholder.component.spec.ts`. Verificado leyendo el archivo: los 3 imports/usos de `node:fs`/`node:path`/`__dirname` llevan `// @ts-expect-error` con comentario explicando el gap compartido (`@types/node` ausente de `tsconfig.spec.json`). Mismo patrón ya tolerado en los 4 specs hermanos — no es una técnica nueva introducida sólo para este archivo.

**Frontend build (`rtk npm run build`)**: verde, ~3.7s.

**Frontend lint**: sigue sin existir el script `lint` — SUGGESTION persiste, sin cambios.

---

## CRITICAL-1 (pasada 1) — Reverificado CERRADO, con probe independiente nuevo

No me apoyé en `placeholder.component.spec.ts` (que ya es parte del código bajo prueba) como única evidencia. Construí una prueba temporal (`frontend/src/app/__verify_probe_r3__.spec.ts`, creada y eliminada en esta pasada, `git status` confirmado limpio después):

- Extrae las rutas hijas reales de `path: 'app'` en `app.routes.ts` (para no depender del `authGuard`, que redirige a `/login` en un `TestBed` sin sesión — el intento inicial con las rutas completas falló así, no por `NG0950`; se corrigió el probe, no el código).
- Monta `provideRouter(probeRoutes, withComponentInputBinding())` — la config real de producción.
- Con `RouterTestingHarness`, navega a las 6 rutas placeholder (`/inicio`, `/incidencias`, `/mapa`, `/organizaciones`, `/categorias`, `/ubicaciones`).
- Afirma que el `router-outlet` tiene contenido renderizado (`textContent.length > 0`) y que ese contenido no matchea `/error|404/i`.

**Resultado: 6/6 verdes.** Las 6 rutas renderizan el placeholder real sin lanzar `NG0950`. Confirma independientemente lo que ya reportaba `placeholder.component.spec.ts` (4/4 verdes, incluida la regresión que reproduce `NG0950` con `TestBed` sin bindings).

`app.config.ts:2,86` confirmado por lectura: `provideRouter(routes, withComponentInputBinding())`.

**Veredicto CRITICAL-1: sigue CERRADO.** No hay indicio de que la corrección de CRITICAL-2 (ronda 3, ver abajo) lo haya tocado — los archivos que cambiaron en ronda 3 (`menu-map.spec.ts`) son ajenos a `PlaceholderComponent`/`app.config.ts`/`app.routes.ts` (salvo el `path: 'incidencias'` usado en la mutación reversible de CRITICAL-2, ver abajo).

---

## CRITICAL-2 (pasadas 1 y 2) — Reverificado CERRADO

### Verificación estática

`backend/src/modules/menus/menu-map.spec.ts` ya no contiene `KNOWN_APP_ROUTES` en ningún lado del código — sólo aparece en 3 comentarios que narran su eliminación (líneas 20, 54, 120). Grep dedicado sobre el archivo completo en busca de cualquier mecanismo de escape residual (`allowlist`, `Set<string>` adicional, `skip`, `continue`, `exception`, lista hand-maintained bajo otro nombre) — no encontré ninguno. El único `Set<string>` del archivo es `readAppRoutesSegments()`, que se construye leyendo `app.routes.ts` desde disco, no a mano.

### Verificación empírica — mutación en vivo (esta pasada, revertida)

**Prueba decisiva (ruta fantasma en `MENU_MAP`, backup + diff verificado vacío tras revertir):**
1. Agregué `Ghost: { route: '/ghost-not-registered', requires: 'READ incidents', icon: 'tag', order: 999 }` al final de `MENU_MAP` en `backend/src/modules/menus/menu-map.ts`, sin tocar `app.routes.ts` ni ningún otro archivo.
2. Corrí `npx jest --testPathPatterns=menu-map.spec` → **`menu-map.spec.ts` FALLÓ**, con el mensaje exacto: `MENU_MAP referencia 1 ruta(s) cuyos segmentos no están en app.routes.ts. [...] "label": "Ghost", "missing": ["ghost-not-registered"]`.
3. Busqué explícitamente cualquier forma de poner el test en verde sin tocar `app.routes.ts` — no existe ninguna lista, constante ni excepción en el archivo actual que pueda absorber la entrada `Ghost`. El único camino verde es registrar la ruta en Angular o borrar la entrada de `MENU_MAP`.
4. Revertí `menu-map.ts` desde el backup; `diff` vacío confirmado.

**Dirección inversa (ruta real borrada de Angular, backup + diff verificado vacío tras revertir):**
1. Borré el bloque completo `{ path: 'incidencias', ... }` de `frontend/src/app/app.routes.ts`.
2. Corrí el mismo test → **falló** con `"label": "Lista de Incidencias", "missing": ["incidencias"]`.
3. Revertí `app.routes.ts` desde el backup; `diff` vacío confirmado.

### Mensaje de error

El mensaje (`"MENU_MAP referencia N ruta(s) cuyos segmentos no están en app.routes.ts. ¿Se borró o renombró la ruta en el frontend?"`) ya no sugiere ningún atajo — no menciona ninguna lista a mano como remedio. La única mención de "agregar a una lista" que queda en el archivo es en el docblock, y es para el caso genuinamente distinto de segmentos parametrizados (`:id`, `:rolId`), que además tiene su propio test dedicado (`parametric segments of MENU_MAP routes...`) que exige que el literal `:xxx` esté declarado en `app.routes.ts` — no hay entradas parametrizadas en el `MENU_MAP` actual (los 10 registros son planos), así que ese segundo test hoy pasa vacuamente, pero no representa un bypass: no hay mecanismo para eximir una ruta plana vía ese camino.

**Veredicto CRITICAL-2: CERRADO.** La escapatoria de las pasadas 1 y 2 (`KNOWN_APP_ROUTES` como lista hand-maintained con `continue` sin condicionar) fue eliminada, no estrechada. Reproducida ambas direcciones con mutación en vivo en esta pasada, código restaurado exacto.

---

## SUGGESTION (pasada 2) — segment-matching no es validación jerárquica: reevaluado, permanece SUGGESTION

Recalculé el set completo de segmentos `path:` de `app.routes.ts` (25 literales) y los crucé contra las 10 rutas de `MENU_MAP`. Sólo dos entradas son multi-segmento: `/admin/users` y `/admin/roles` — ambas composiciones son reales en el árbol de rutas (no hay ningún par de segmentos sueltos en ramas no relacionadas que produzca una ruta de `MENU_MAP` falsamente válida hoy). Las 8 entradas restantes son de un solo segmento, para las cuales "segmento suelto" y "ruta real" coinciden por construcción.

No pude construir un caso concreto que dispare la debilidad contra el árbol actual — igual que en pasada 2. Se mantiene como **SUGGESTION**: la solución completa (parsear la jerarquía real con un walker de rutas anidadas) es un follow-up documentado en el docblock del propio spec, no bloqueante mientras el `MENU_MAP` no crezca con combinaciones ambiguas.

---

## WARNING (pasada 2) — `assertNotErrorPage()` no detectaba un componente que revienta: verificado REFORZADO

Leí `frontend/e2e/menu-navigation.e2e.ts:43-76` completo. La función ahora hace dos aserciones:
1. **Positiva** (nueva): lee `textContent` del contenido montado en el `router-outlet` (o su sibling) vía `page.evaluate()` y exige `length > 0`, con mensaje `clic en "X" no renderizó contenido en el router-outlet`. Esto sí detectaría el escenario de CRITICAL-1 (componente que lanza y deja el outlet vacío).
2. **Negativa** (la original, conservada): heading `/error|404|no encontrad/` ausente.

El e2e sigue sin poder ejecutarse en este entorno (`BASE_URL` no confirmado — WARNING-3 de pasada 2 persiste sin cambios, no bloqueante), pero el gate en sí quedó reforzado tal como se pidió. **Estado: cerrado.**

---

## WARNING (pasada 2, nuevo) — `placeholder.component.spec.ts` aportaba 3 errores nuevos al typecheck: verificado CERRADO

Ver sección "Build & Tests Execution" arriba: 14 errores totales (bajó de 18), cero provenientes de `placeholder.component.spec.ts`. La solución (`@ts-expect-error` puntual con comentario explicando el gap y remitiendo a un change dedicado para `@types/node`) replica el patrón ya tolerado en 4 archivos hermanos preexistentes — no introduce una técnica nueva ni oculta un error real de producción (sólo afecta al type-check estricto de un spec, no a `ts-jest` ni al build). **Estado: cerrado.**

---

## Verificaciones adicionales de esta pasada (contrato completo, no sólo la lista de pendientes)

- **`tasks.md` 20/20**: reconfirmado (`grep -c`).
- **Conteo 10 vs 11**: reconfirmado — `tasks.md:31,38` dicen 10, coincide con `design.md` D4 y con las 10 claves reales de `MENU_MAP`.
- **`menus.service.spec.ts` modificado**: revisé el diff completo. Las aserciones que cambiaron corresponden exactamente al contrato que F1.2 rediseña a propósito (el `MENU_MAP` viejo de 5 entradas en inglés vs el nuevo de 10 en español) — es el rewrite designado por la tarea F1.2.1 ("escribir primero los specs"), no una edición oportunista de una aserción no relacionada para maquillar un fallo. No encontré ninguna aserción tocada fuera del alcance declarado del change.
- **`path: 'Reportes'` duplicado**: confirmado ausente (`grep` sin matches salvo el `breadcrumb: 'Reportes'` legítimo de la sección real `reportes`).
- **`/app/reportes/dashboard` y `/app/reportes/listado-clientes` alcanzables**: confirmado, el bloque `path: 'reportes', children: [...]` intacto.
- **D4 vs implementación**: las 10 filas de `menu-map.ts` coinciden exactamente con la tabla D4 de `design.md` (label, route, group, order, requires).
- **Gates completos**: backend test/lint, frontend test/build/typecheck, todos ejecutados en esta pasada con salida real (no copiados de `apply-progress.md`).

---

## Issues Found — Pasada 3

**CRITICAL**: Ninguno.

**WARNING**: Ninguno accionable. (El único punto histórico que persiste, e2e atado a `BASE_URL` de staging, es informativo — no bloquea archive porque D6 ahora cubre la garantía central de forma unitaria y determinística en CI, sin depender de staging.)

**SUGGESTION**:
1. Segment-matching de D6 no reconstruye jerarquía real de rutas — debilidad estructural documentada, sin caso concreto que la dispare hoy contra el árbol de 10 entradas vigente. Reevaluar si `MENU_MAP` crece con rutas de más de 2 segmentos.
2. `pnpm lint` no existe en `frontend/package.json` — gap preexistente, documentado, decisión explícita de no resolverlo en F1.
3. `@ts-expect-error` en 4 specs hermanos (`node:fs`/`node:path`/`__dirname` sin `@types/node`) sigue siendo deuda de tooling compartida — candidata a change dedicado que agregue `@types/node` a `tsconfig.spec.json`.

---

### Verdict — Pasada 3

**PASS**

Los dos CRITICAL de la pasada 1 están cerrados con evidencia reproducida de forma independiente en esta pasada (mutación en vivo para CRITICAL-2 en ambas direcciones; navegación real vía `RouterTestingHarness` con la configuración de producción para CRITICAL-1), no por lectura de `apply-progress.md`. Los tres WARNING de pasada 2 están resueltos o reforzados según lo pedido. La única SUGGESTION que sigue abierta (segment-matching no jerárquico) permanece sin caso concreto que la active contra las 10 rutas vigentes, tal como en la pasada 2 — correctamente clasificada como no bloqueante.

Backend 883/883, frontend 227/227, lint backend 0 errores, typecheck frontend 14 errores (todos preexistentes y ajenos a F1, confirmado archivo por archivo), build frontend verde. Árbol de trabajo limpio tras cada mutación de verificación (probes temporales creados y eliminados, tres reversiones confirmadas con diff vacío).

Recomendación: **archivar.** No quedan CRITICAL ni WARNING accionables. `fixes-required.md` se eliminó — no hay nada pendiente que devolver a `sdd-apply`.
