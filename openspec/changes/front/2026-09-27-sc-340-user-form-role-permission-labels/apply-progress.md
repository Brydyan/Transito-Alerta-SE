# Apply Progress: sc-340 user form role & permission labels

**Change**: `front/2026-09-27-sc-340-user-form-role-permission-labels`
**Rama**: `carlos_fp/sc-340/fix-user-form-orphan-role-names-raw-uuids`
**Strict TDD**: activo. Cada task de tests se escribió y se vio fallar antes de implementar.

---

## Fase 1 — Backend (RC1) — COMPLETADA

| Task | Estado | Evidencia |
| --- | --- | --- |
| T1 test RED `getFormData` | ✅ | 2 tests nuevos en `users.service.form-data.spec.ts`. RED observado: `where.deletedAt` = `undefined`, `Expected constructor: FindOperator` |
| T2 filtro `deletedAt: IsNull()` | ✅ | `users.service.ts:67-73`, ambas ramas |
| T3 GREEN + test preexistente | ✅ | `users.service.form-data.spec.ts`: 6/6 PASS |

### Hallazgo: un test preexistente codificaba el bug

`users.service.form-data.spec.ts:93` afirmaba `where: {}` para el system admin, con el
comentario *"System admin's role query MUST carry an empty `where` (no exclusion)"*. Esa
aserción **bloqueaba el fix de sc-340**: un `where` vacío no es "sin exclusión de nombres",
es "sin ningún filtro". Se reemplazó por tres aserciones que distinguen las dos cosas:
`where` sin `name`, con `deletedAt` presente, y del tipo `isNull`. El comentario del test
registra que la aserción anterior fijaba el defecto.

### Corrección de dos RED falsos (míos, no de RC1)

- El primer RED del test "non-system admin" falló con `TypeError: organizations.map` porque no
  mockeaba `orgRepo`. Fallaba por una razón ajena al defecto; se corrigió antes de implementar.
- Se eliminó un tercer test que escribí y que era **tautológico**: filtraba el resultado con
  `where.deletedAt !== undefined`, es decir, evaluaba el mock que estaba inspeccionando en vez
  del comportamiento del service. Un test que pasa por construcción no prueba nada.

### Criterio de aserción elegido

`toBeDefined()` sobre `where.deletedAt` habría pasado con cualquier basura. Se verifica
`toBeInstanceOf(FindOperator)` **y** `type === 'isNull'`, porque un filtro de soft-delete es
`isNull` y nada más. El tipo se confirmó empíricamente contra el typeorm instalado
(`FindOperator { _type: 'isNull' }`), no de memoria.

---

## Fases 2-6 — Frontend (RC2, RC3, RC4) — COMPLETADAS

Ejecutadas por un writer acotado (Fase 1 quedó en el parent porque la observación RED era
crítica). Verificadas por el parent, no aceptadas por reporte.

| Task | Estado | Test que la cubre |
| --- | --- | --- |
| T4 modelo del wire | ✅ | `users.service.spec.ts` bloques T6/T8 |
| T5 `permissionLabel()` puro | ✅ | `users.service.spec.ts` T5 (3 tests) |
| T6+T7 proyección del catálogo | ✅ | T6 `never yields the string "undefined"` |
| T8+T9 array plano \| envelope | ✅ | T8 (2 tests) |
| T10+T11 resolución de UUIDs | ✅ | T10 (2 tests: resuelve + marcador explícito) |
| T12 render de labels | ✅ | T10 (service) + T17 (component) |
| T13+T14 filtro null-safe | ✅ | `user-form.component.spec.ts` T13 (**archivo nuevo**) |
| T15+T16 trackBy / binds | ✅ | T15 (label legible + trackBy real) |
| T17 render con UUIDs | ✅ | `new-user-form.component.spec.ts` T17 (2 tests) |
| T18 fixture stale | ✅ | `roles.component.spec.ts` 12/12, nombres post-0040 + `rolId` UUID |

## Fase 7 — Cierre — COMPLETADA

| Check | Resultado observado |
| --- | --- |
| `cd frontend && pnpm test` | `Test Suites: 98 passed, 98 total` / `Tests: 807 passed, 807 total` (24.071 s) |
| `cd frontend && pnpm run build` | `Application bundle generation complete` / **EXIT=0** |
| `cd backend && npm test` | `Test Suites: 123 passed, 123 total` / `Tests: 11 skipped, 1254 passed, 1265 total` (48.846 s) |
| `cd backend && npm test -- users.service.form-data` | `Test Suites: 1 passed` / `Tests: 6 passed, 6 total` |

### Revalidación 2026-09-30 (auditoría de `git status` vs spec)

Los gates se volvieron a correr **de forma independiente**, no en paralelo. Resultados:

| Check | Resultado |
| --- | --- |
| `frontend pnpm test` | `98 passed, 98 total` / `807 passed, 807 total` ✅ |
| `frontend pnpm run build` | `EXIT=0`, bundle `608.17 kB` — idéntico al apply ✅ |
| `backend npm test` (suite sola) | `123 passed, 123 total` / `1254 passed` en **23.9 s** ✅ |
| `backend npm test -- core/storage/noop-storage.client` (aislado) | `5 passed` — el test tarda **14 ms** ✅ |

### Fallas ambientales conocidas (NO regresiones de este change)

`core/storage/noop-storage.client.spec.ts › upload: writes the buffer to {rootDir}/{key}` falla
con `Exceeded timeout of 5000 ms` **cuando la suite compite por CPU** — observado al correr
frontend y backend en paralelo, donde el run completo subió de ~24 s a ~82 s por suite. Aislado
pasa en 14 ms, y la suite backend completa pasa 123/123 cuando corre sola.

Ese spec **no lo toca este change** (no aparece en el diff de ningún lado) y su dependencia de
un write real a disco con timeout de 5 s lo hace susceptible a contención. Se registra acá para
que una re-corrida concurrente no se lea como rotura de sc-340.

⚠️ Backend emite `A worker process has failed to exit gracefully` (teardown leak). **Preexistente**,
aparece en la suite completa y no en el spec aislado; no introducido por este change.

⚠️ Frontend emite `bundle initial exceeded maximum budget. 600 kB … total of 608.17 kB`.
**Verificado preexistente**: se construyó en `HEAD` con el cambio stasheado y dio el MISMO
`608.17 kB`. Este change agrega **0 bytes** al bundle inicial (las interfaces son types-only y se
borran al compilar). No es regresión.

## Desviaciones honestas respecto de `tasks.md`

- **D-T1 — el RED de T1 como estaba escrito era imposible.** `tasks.md` pedía "el repo mockeado
  devuelve un rol con `deletedAt` definido; se afirma que la respuesta lo excluye". Con el repo
  mockeado eso no se puede observar: el mock ES la frontera de base de datos y el service no
  filtra filas, las filtra la query. El único contrato observable es el `where`. El test real
  afirma sobre `where.deletedAt`, que es donde el defecto vivía.
- **D-T2 — mis tasks sobre-especificaron defectos de template que no existen.** Afirmaban binds
  rotos en `user-form.component.html:274,304,318,322`. Leídos: los cuatro ya son correctos para el
  modelo alineado. `:274` renderiza el string, `:304` ya trackea `perm.permisoId`, `:318/:322`
  ya leen `perm.nombre`/`perm.accion`. El bug era siempre el **dato**. El writer no los editó y
  lo reportó; la decisión fue correcta. Consecuencia: T12 y T16 no tocaron templates.
  **Resuelto en el spec**: los `Acceptance` de R2 Scenario 3 y R5 Scenario 8 apuntaban a esos
  binds como sitio del fix; se corrigieron y se dejó la **Enmienda A-1** al pie del spec para que
  `sdd-verify` no intente "arreglar" binds que ya funcionan.
- **D-T3 — T16 no necesitó edición de binds**: el fix real fue normalización idempotente en el
  intake del componente más el filtro null-safe.
- **D-T4 — `getRolePermissions` reusa `getPermissions()` vía `switchMap`**, así que seleccionar un
  rol vuelve a pedir el catálogo aunque `NewUserFormComponent` ya lo cargó. Se eligió corrección
  sobre plomería. Costo: una request extra por cambio de rol.
- **D-T5 — se reescribió un test pre-0051** de `getRolePermissions` que afirmaba el contrato
  `"ACTION resource"`, que el backend ya no cumple.
- **D-T6 — el RED de T8-catálogo fue verde antes de implementar** (la normalización `Array.isArray`
  ya existía en el `:278` viejo; el defecto era solo de proyección). Se conserva como candado de
  regresión, no como RED. Reportado como no-RED en vez de disfrazado.
- **D-T7 — el design propuso un helper que nunca se implementó** (detectado 2026-09-30 en la
  auditoría). La sección «Contratos TypeScript» del design define `filterPermissions(...)` como
  función de filtrado null-safe. El apply **no** la creó: la null-safety quedó inline en
  `UserFormComponent.filteredAllPerms` con `?? ''` en cada campo, más la normalización
  idempotente `toPermissionItem` en el intake. El comportamiento exigido por R5 se cumple igual
  y está cubierto por T13/T15, pero el shape del design no es el que quedó. Motivo de la
  diferencia: `filterPermissions` habría sido un export más del modelo para un filtro de tres
  líneas usado en un solo lugar, y la normalización del intake ya cubría el caso real (entradas
  en forma de wire). El snippet del design quedó anotado en el lugar para que no se lea como
  contrato pendiente.

## Follow-ups declarados (fuera de alcance, con dueño)

- **F1** `backend/src/modules/roles/roles.service.ts:155-160` — `perm.split(' ')` sobre UUIDs
  post-0051 → `modules` siempre vacío → card de módulos en cero. Change sugerido:
  `back/roles-stats-modules-from-uuids`.
- **F2** `GET /api/users/:id` no devuelve el desglose → `permisosDirectos` hardcodeado `[]` →
  nada pre-marcado al editar. Change sugerido: `back/user-permissions-breakdown`.
- **F3 (nuevo, descubierto durante el apply)** — `expect()` dentro de `.subscribe()` pasa
  **vacío** en este repo (el writer lo prueba con una aserción imposible que igual pasa; RxJS 7
  entrega el error de forma asíncrona y nunca llega a Jest). Los tests sc-340 usan
  capture-then-assert fuera del subscribe. Pero los tests F6 preexistentes en
  `users.service.spec.ts` (`getFormData`, `createUserJson`, `uploadAvatar`) siguen con ese patrón
  y **no prueban nada**. No se tocaron por estar fuera del radio de impacto. Change sugerido:
  `front/replace-vacuous-subscribe-assertions`.
- **F4 (nuevo, teórico)** — entradas de catálogo degeneradas sin `id` reciben `permisoId: ''` y
  `@for` volvería a avisar claves duplicadas. El wire real siempre trae la PK, así que es
  teórico. Si aparece, el fix es un `trackBy` por índice compuesto.

## Diff real (medido, no estimado)

| Métrica | Estimado en `tasks.md` | Real |
| --- | --- | --- |
| Archivos de producción | 6 | 6 |
| Archivos de test | 5 | 5 |
| Reparto prod / test | — | ~223 prod / ~386 test |

### Corrección del conteo de líneas (auditoría 2026-09-30)

El conteo original de este documento decía **609 líneas authored (479 tracked + 130 spec
nuevo)**. **No cierra contra el árbol.** Medición con `git diff --numstat`:

| Bucket | Líneas (add+del) |
| --- | --- |
| Código + test (tracked modificados, sin `.atl/`) | **541** |
| Test nuevo `user-form.component.spec.ts` | **130** |
| **Subtotal código + test** | **671** |
| Artefactos OpenSpec (`proposal`, `spec`, `design`, `tasks`, `apply-progress`) | **803** |
| `opencode.json` — **ajeno al change** | 10 |
| Ruido `.atl/` (skill registry cache) — **ajeno al change** | 47 |
| **Total del working tree** | **1531** |

Tres precisiones:

1. El número que respaldó el `size:exception` (**609**) no coincide ni con el subtotal real de
   código + test (**671**) ni con el total del árbol (**1531**). La diferencia de ~62 líneas
   contra el "479 tracked" original no está explicada; el conteo se rehízo desde cero.
2. Los **803 de artefactos OpenSpec no estaban contabilizados**. Si el presupuesto de 400
   líneas los incluye, el change va bastante más arriba de lo que se aprobó.
3. `opencode.json` (config de MCP de OpenCode) y `.atl/` son ruido de tooling, ajenos a sc-340.
   Deben quedar fuera del commit.

**Sobre presupuesto.** El presupuesto de 400 líneas no se dispara por el volumen de producción
(~223) sino por el costo de TDD estricto: ~386 líneas de test para 6 requirements. Estrategia
cacheada: `ask-on-risk` → decisión del humano antes de commitear.

### Decisión de presupuesto: `size:exception` APROBADA

El humano eligió **un PR con `size:exception` maintainer-approved** sobre partir en 3 PRs
encadenados. Esta ejecución de apply usa `size:exception` aprobado explícitamente.

> ⚠️ **La aprobación se tomó sobre la cifra de 609, que la medición de la auditoría
> 2026-09-30 corrigió** (ver «Corrección del conteo de líneas»). La decisión sigue siendo del
> humano y no se re-litiga acá: lo que se registra es que el número de referencia cambió. Si el
> presupuesto de 400 incluye los artefactos OpenSpec, el total real (1531) cambia la
> conversación y conviene una re-confirmación antes de commitear.

Un split en 2 se descartó con medición, no con opinión: el backend son ~65 líneas, con lo cual el
frontend solo mide ~544 y sigue sobre el presupuesto. Los 4 root causes son un mismo bug visible
para el usuario; partirlo fragmenta la historia de review y los tests comparten el modelo de wire.

Entrega: el working tree queda listo y **sin staging residual**. Por `AGENTS.md` §5 el humano
commitea, el agente no.

> **Nota de higiene (auditoría 2026-09-30)**: al momento de esta auditoría el árbol tenía **7
> archivos en stage**, contra lo que este documento afirma arriba. `opencode.json` —config de
> MCP de OpenCode, nunca trackeada en el historial del repo y sin relación con sc-340— se sacó
> del stage y debe quedar fuera del commit (idealmente en `.gitignore`, decisión que queda para
> el humano porque es política del repo). Los artefactos OpenSpec sí pertenecen al change.
> Los `.atl/` modificados (47 líneas de skill-registry cache) también son ruido de tooling.

### Riesgo residual aceptado

- `getRolePermissions` refetch del catálogo en cada cambio de rol (D-T4). Una request extra, sin
  impacto funcional.
- Entradas de catálogo degeneradas sin `id` → `permisoId: ''` → posible clave duplicada en
  `@for` (F4). Teórico: el wire real siempre trae la PK.
