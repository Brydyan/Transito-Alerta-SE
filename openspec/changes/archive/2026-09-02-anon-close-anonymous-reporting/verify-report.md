# Verify Report — ANON: Cerrar el reporte sin sesión

**Change**: `back/2026-09-02-anon-close-anonymous-reporting`
**Story**: sc-326 (ROADMAP.md:47 — confirmado; ver ROADMAP.md:48, sc-327 es AUD)
**Fecha de verificación**: 2026-09-05 (ronda 2)
**Modo**: Strict TDD (activo para el proyecto)
**Verificador**: sdd-verify (ronda 2 — fixes-required.md de la ronda 1)

---

## 0. Resumen ejecutivo

C1 (CRITICAL) está **cerrado, confirmado con ejecución real**: la migración
0048 y su rollback están rastreados en git (`git status --short` → `A `,
agregados al índice por el usuario, verificado), `MIGRATION_LOG.md` tiene su
fila, y la compuerta exacta de `ci.yml` (`Migration log has no unrecorded
entries`) no imprime ninguna línea. Los seis WARNING de la ronda 1 (W1, W3,
W4, W5, W6, W7) están **cerrados con evidencia real**, no sólo con la
narrativa de `apply-progress.md` — verifiqué cada uno leyendo el código
resultante, no sólo el resumen.

Se ejecutaron las cinco compuertas de backend, las tres de frontend, la
compuerta de e2e completa y el bucle de migraciones de `ci.yml`. Todas
pasan con números idénticos a la referencia de la ronda 1 (ningún número
bajó, el e2e sigue en 52/52 · 448/448 incluyendo el archivo nuevo de D.2).

Encontré **un WARNING nuevo** en esta ronda (W8 — stale docs dentro de
`tasks.md`, en una sección que este mismo commit tocó para otra cosa) y
confirmé que **W2 (ventana de caché) sigue abierto**, tal como la ronda 1 lo
dejó — es un riesgo acotado y documentado, no bloqueante, sin instrucción
de despliegue explícita todavía. Encontré además un hallazgo de proceso
sobre la propia compuerta de migraciones de `ci.yml` (ver sección 5,
SUGGESTION-S1): detecta una migración sin registrar, pero no puede detectar
una migración ausente del árbol que CI efectivamente revisa — es
estructuralmente ciego a "faltar", sólo ve "sobrar sin registrar". No
bloquea esta ronda (0048 ya está rastreado), pero es una brecha real del
propio pipeline que motivó el C1 original.

**Status**: **pass-with-warnings** — 0 CRITICAL, 2 WARNING abiertos (W2
heredado + W8 nuevo), 2 SUGGESTION.

---

## 1. Completeness — tasks.md

| Métrica | Valor |
|---|---|
| Tareas totales | 18 |
| Marcadas `[x]` | 18 |
| Casillas respaldadas por código real | 18/18 — `grep -rniE "TODO|stub|placeholder|pendiente|not implemented"` sobre los 18 archivos tocados por ANON no arrojó ningún hallazgo real (las coincidencias de la búsqueda son falsos positivos: "TODO" como pronombre en español, "pendiente" en filas de `MIGRATION_LOG.md` ajenas a 0048) |
| D.2 (W7 de la ronda 1) | **Corregido** — el texto "PARCIAL... queda como item del gate de sdd-verify pasada 2" fue reemplazado por "HECHO en la ronda 1 — `anon-no-anonymous-creation.e2e-spec.ts` (3 tests, 3/3 PASS)" |
| A.4 y "Estado de gates" (footer de `tasks.md`) | **Seguían stale** — ver W8 |

---

## 2. Ejecución real de las compuertas de `ci.yml`

Todas corridas de verdad en esta sesión, no asumidas.

### Backend
| Compuerta | Comando | Resultado |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | ok (`Already up to date`) |
| Lint | `pnpm run lint` | **0 errors, 19 warnings** (idénticas a la referencia — todas en archivos ajenos a ANON: `mail-outbox.consumer.spec.ts`, `notifications.controller.spec.ts`, `events.gateway.spec.ts`, `users.service.spec.ts`) |
| Typecheck | `npx tsc -p tsconfig.json --noEmit` | **exit 0** |
| Build | `pnpm run build` (`nest build`) | **exit 0** |
| Unit tests | `npx jest` | **100/100 suites, 915/915 tests PASS** (14.0s) |
| E2E completo | `npx jest --config test/jest-e2e.json` | **52/52 suites, 448/448 tests PASS, 0 fallos** (581.5s) — incluye `anon-no-anonymous-creation.e2e-spec.ts` (3/3 PASS) y los 7 e2e reescritos |

### Frontend
| Compuerta | Comando | Resultado |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | ok |
| Unit tests | `npx jest` | **47/47 suites, 326/326 tests PASS** (4.0s) |
| Build | `pnpm run build` | **exit 0** |
| Typecheck (informativo) | `npx tsc -b --noEmit` | **10 errores**, carácter por carácter idénticos a la referencia de la ronda 1 (`auth.service.spec.ts:227`, `placeholder.component.spec.ts:3,11,69,81`, `layout-tokens.regression.spec.ts:23,24,25,27,27`) — ninguno tocado por ANON |

### Compuerta de migraciones (la que falló en la ronda 1)
```
for file in database/migrations/[0-9]*.sql; do
  id=$(basename "$file" | cut -d_ -f1)
  grep -q "^| $id |" database/MIGRATION_LOG.md || echo "falta $id"
done
```
**Resultado real**: no imprime ninguna línea. **La compuerta PASA.**

Confirmé independientemente:
- `git status --short` → `database/migrations/0048_close_anonymous_ceiling.sql` y `database/rollback/0048_close_anonymous_ceiling.DOWN.sql` aparecen como `A ` (staged), no `??`.
- `database/MIGRATION_LOG.md:105` tiene la fila `| 0048 | close_anonymous_ceiling | ... | ⏳ Pending | — | — | — |`, con el mismo formato de columnas que las filas 0043/0044.

**C1 está cerrado.**

---

## 3. Los seis WARNING de la ronda 1 — verificados uno por uno con código, no con la narrativa

### W1 — Story number (sc-327 → sc-326) ✅ CERRADO
`grep -rn "sc-327" backend/src backend/test database/migrations database/MIGRATION_LOG.md openspec/changes/back/2026-09-02-anon-close-anonymous-reporting` no devuelve ningún resultado, salvo la narrativa histórica dentro de `apply-progress.md` (que documenta el propio fix, esperable). `openspec/ROADMAP.md:47-48` confirma 326=ANON, 327=AUD. Verificado en 8 puntos de código real: `auth.config.ts:60,78`, `auth-errors.ts:53`, `auth.service.ts` (comentario del rechazo), `database/MIGRATION_LOG.md:105`, `0048_close_anonymous_ceiling.sql` (cabecera y cuerpo), controllers de incidents/comments.

### W2 — Ventana de caché tibia tras deploy ⚠️ ABIERTO (heredado, no bloqueante)
- **TTL de caché** (`auth.config.ts:74-76`): `permissionCacheTtlSeconds` default **3600s (1h)**, vía `PERMISSION_CACHE_TTL_SECONDS`.
- **TTL de access token** (`auth.config.ts:71`): `jwtAccessExpiresIn` default **`'15m'`**, vía `JWT_ACCESS_EXPIRES_IN`.
- **Escenario real**: un access token anónimo emitido segundos antes del deploy, con una entrada de caché `perm:v3:uid:*` ya tibia con los 4 permisos viejos, puede servir esos permisos hasta que **el token expire (máx. 15 min)** — el TTL del caché (1h) es la cota nominal, pero el token es la cota efectiva porque sin login nuevo no hay forma de generar tráfico nuevo bajo esa identidad (el login ya está cerrado).
- **Sin instrucción de despliegue**: `grep -ni "purga|purge|flush|invalidar|redis-cli|deploy"` sobre `tasks.md` y `apply-progress.md` sólo encuentra la mención de B.4 ("documentado como follow-up si se necesita"), no un paso operativo real. Esto sigue siendo **una instrucción de runbook que falta**, tal como la ronda 1 lo señaló.
- **Precedente en el proyecto**: la migración 0043 sí bump-ea `permission_version` para invalidar `perm:v3:uid:*`; 0048 no lo hace (la fila anónima no tiene `role_id`, así que el mecanismo de 0043 no aplica directamente — es una asimetría real, no un descuido trivial, pero tampoco está documentada como decisión consciente en ningún artefacto).
- **Juicio**: mantengo esto como WARNING, no CRITICAL — el riesgo está acotado a ≤15 minutos post-deploy y sólo afecta tokens ya emitidos (nadie puede generar tráfico anónimo *nuevo*). No cambia el veredicto de archivado, pero debería convertirse en un ticket de seguimiento explícito antes de que el proyecto lo repita (ya hubo un incidente de caché de permisos rancio en este proyecto).

### W3 — Restaurar prueba "config gana sobre BD" ✅ CERRADO
`auth.service.spec.ts:662-693`, test "ANON: getAuthContextByUserId for the anonymous row now returns an empty permission set" — el mock de `dataSource.query` ahora usa `permissions: ['UPDATE incidents']` (confirmado leyendo el archivo), y la aserción `expect(ctx.permissions).toEqual([])` se mantiene. La red por mutación está restaurada: si `isAnonymous ? anonymousPermissions : ...` cayera a `row.permissions`, este test fallaría con `['UPDATE incidents']` en vez de `[]`. Corrí el test — sigue en verde (parte de los 915/915).

### W4 — Rama muerta en `getPermissions(deviceUuid)` ✅ CERRADO
`auth.service.ts:478-493` — el bloque `if (deviceUuid === anonymousDeviceUuid) { return anonymousPermissions; }` fue eliminado (Opción A de `fixes-required.md`, la recomendada). Confirmado leyendo el método completo: ya no destructura `anonymousDeviceUuid` ni `anonymousPermissions`, sólo `permissionCacheTtlSeconds`. El comentario que queda documenta por qué se eliminó y por qué no reintroducirla. `npx jest` sigue en 100/100 · 915/915 — la eliminación no rompió nada, confirmando que la rama era en efecto inalcanzable.

### W5 — Comentarios de cabecera desactualizados ✅ CERRADO
`incidents.controller.ts:42-54` y `comments.controller.ts:26-34` — leí ambos comentarios completos: ya no afirman que la identidad anónima tiene `CREATE`/`READ`; en su lugar documentan que la identidad anónima no puede autenticarse, que la migración 0048 vació el `permissions` denormalizado, y referencian `anon-no-anonymous-creation.e2e-spec.ts` como la verificación runtime.

### W6 — `anon-config.patch` huérfano ✅ CERRADO
`ls openspec/changes/back/2026-09-02-anon-close-anonymous-reporting/` confirma que el archivo ya no existe (`git status --short` lo muestra como `D`, borrado y no restaurado).

### W7 — Inconsistencia D.2 en `tasks.md` ✅ CERRADO
`tasks.md:132-146` — el texto de D.2 ahora dice "HECHO en la ronda 1" y referencia `anon-no-anonymous-creation.e2e-spec.ts` (3/3 PASS, confirmado por mí en la corrida de e2e de esta ronda). Ya no contradice el checkbox `[x]`.

---

## 4. Hallazgo nuevo — W8: `tasks.md` tiene otra sección stale que el propio fix de esta ronda no tocó

**Dónde**:
- `tasks.md:34-42` (A.4) — el cuerpo todavía dice: *"`npx jest` (backend) corre 99/99 suites, 902/902 tests PASS... no los ejecuto en este entorno sin DB+Redis... queda como item del gate de sdd-verify pasada 2."*
- `tasks.md:193-197` ("Estado de gates", el pie del archivo) — todavía dice:
  ```
  - `npx jest` (backend): 99/99 suites, 902/902 tests PASS.
  - `pnpm run test:e2e`: pendiente (requiere DB+Redis en runtime, fuera de este entorno).
  ```

**Por qué importa**: es el mismo patrón que motivó W7 en la ronda 1 ("una regla aplicada en un sitio y no en su vecino") — la ronda 2 sí actualizó D.2 (unas líneas más abajo, en la misma sección D) para decir que el e2e ya corrió y pasó, pero dejó A.4 y el pie del archivo diciendo lo contrario: que el e2e "queda pendiente" y que los números son 99/99·902/902 (el estado pre-ANON/pre-REG-Fix). Alguien que lea sólo A.4 o el pie del archivo concluiría —incorrectamente— que el e2e nunca corrió contra esta implementación. La `apply-progress.md` de la ronda 2 sí tiene los números correctos (100/100·915, 52/52·448) en su propia tabla "Estado de gates (ronda 2 vs ronda 1)", así que el dato correcto existe en el change, sólo no se propagó al archivo que el `git diff` de esta ronda ya estaba tocando por otra razón (sc-327→sc-326, D.2).

**Severidad**: WARNING, no CRITICAL — es documentación desincronizada dentro del propio change, no afecta el código ni el CI real (que lee `MIGRATION_LOG.md`, no `tasks.md`). No bloquea el archivado, pero debería corregirse en la misma pasada que ya tocó este archivo, para no dejar una fuente de verdad interna contradictoria de cara a `sdd-archive`.

**Recomendación**: actualizar A.4 y el "Estado de gates" final de `tasks.md` con los números reales de esta ronda: backend unit 100/100·915/915, e2e 52/52·448/448 (incluye `anon-no-anonymous-creation.e2e-spec.ts`), frontend 47/47·326/326, `tsc` exit 0, lint 0 errores.

---

## 5. La migración 0048 — verificación de exactitud, idempotencia y honestidad del log

- **DOWN exacto**: comparé carácter por carácter el bloque `SET permissions = ... WHERE device_uuid = 'anonymous';` de `0048_close_anonymous_ceiling.DOWN.sql` contra el mismo bloque de `0008_anonymous_read_comments.sql` (`diff` de ambos fragmentos) → **idénticos**. El `DOWN` restituye exactamente los 4 permisos que 0008 estableció, sin el desfase que hubo en sc-315 (donde el `UP` se arregló y el `DOWN` quedó roto en el mismo archivo). No es el caso acá.
- **Idempotencia**: el `UP` (`SET permissions = '[]'::jsonb`) y el `DOWN` (`SET permissions = '[...4 items...]'::jsonb`) son ambos `UPDATE` incondicionales sobre el mismo predicado — correrlos dos veces seguidas dos veces es un no-op la segunda vez en ambos sentidos. Confirmado por inspección (no hay lectura de estado previo que dependa de una sola ejecución).
- **`MIGRATION_LOG.md:105`**: describe correctamente lo que la migración hace (`UPDATE users SET permissions='[]'...`), por qué (cierre del login anónimo), qué NO hace (no borra la fila, no toca 0008), y referencia el rollback. Estado `⏳ Pending` es honesto — no fue aplicada contra ningún entorno real todavía (columnas Autor/Fecha/Entorno en `—`), consistente con el patrón de 0043/0044 (que también quedaron `⏳ Pending` hasta que un operador humano las corra, por la política CC3 del propio log: "Never mark a migration ✅ Applied until it has actually been run against that environment").
- **Nota menor (no bloqueante)**: el comentario de cabecera de `0048...sql` (línea ~31) dice *"Ver `back/2026-09-02-anon-close-anonymous-reporting/tasks.md` para la rationale (sección 'B.3' del design)"* — esta cita "del design" es una referencia circular/incorrecta, porque **este change no tiene `design.md`** (confirmado: no existe el archivo). Ya señalado por la ronda 1 (sección 7 de ese reporte) como hallazgo sin impacto real; sigue presente, sin corregir, pero es cosmético — la lógica en sí está bien documentada en el resto del comentario. Lo dejo como SUGGESTION (S2 abajo).

---

## 6. El cache de permisos — riesgo residual (ver también W2 arriba)

Cubierto en la sección 3 (W2). Números concretos: TTL de caché 3600s, TTL de access token 900s (15m) por defecto. No hay instrucción de despliegue explícita para purgar `perm:v3:uid:*`. Riesgo acotado, documentado como WARNING abierto, no bloqueante.

---

## 7. Las 18 casillas y `apply-progress.md` — contraste con el código

Recorrí las 18 tareas de `tasks.md` contra el código real (no sólo contra el texto de `apply-progress.md`):

| Sección | Afirma | Contrastado contra | Veredicto |
|---|---|---|---|
| A.1-A.4 | Rechazo en `login()`, forma de credencial intacta, specs, e2e completo | `auth.service.ts:147-153`, `auth.service.spec.ts`, e2e 52/52 | ✅ Cierto |
| B.1-B.6 | Techo vacío en config, migración 0048, no toca 0008, cache por TTL, specs, inversión de tests | `auth.config.ts:86`, migración 0048, `auth.config.spec.ts`, `auth.service.spec.ts` | ✅ Cierto (B.4 es "cierto pero incompleto" — ver W2) |
| C.1-C.2 | Fila máscara sobrevive, comentario explicativo | `getAuthContextByUserId`, comentario de la migración | ✅ Cierto |
| D.1-D.2 | Guards de clase, e2e sin token → 401 | `@UseGuards` en ambos controllers, `anon-no-anonymous-creation.e2e-spec.ts` (3/3 PASS) | ✅ Cierto |
| E.1-E.4 | Reconciliación de F4 (fuera del código de ANON, en el change hermano F4) | No re-audité F4 en detalle (fuera del scope explícito de esta ronda, ya cerrado en ronda 1) | No repetido — sin cambios reportados en esta ronda |

**No encontré ninguna afirmación falsa** de `apply-progress.md` en esta ronda — a diferencia del patrón del change hermano REG (3 afirmaciones falsas en 10 rondas), lo que reportó esta ronda de ANON coincide con lo que el código y los tests realmente hacen, en cada uno de los 8 puntos que verifiqué con lectura directa de código (no de resumen).

---

## 8. La trampa de la compuerta de migraciones — hallazgo de proceso

Confirmé el mecanismo exacto en `.github/workflows/ci.yml:322-333` ("Migration log has no unrecorded entries"): itera `database/migrations/[0-9]*.sql` **tal como existen en el checkout de CI** (es decir, sólo archivos rastreados y presentes en esa rama/commit), y falla si alguno de esos archivos no tiene fila en `MIGRATION_LOG.md`.

Esto confirma exactamente la asimetría que se pidió evaluar:
- Mientras 0048 estuvo sin rastrear: en **local** el archivo existía en disco sin fila → la compuerta fallaba (correcto, detectó el problema). En **CI**, el archivo simplemente no habría existido en el checkout → el bucle nunca lo habría iterado → **la compuerta pasa en verde con la migración ausente del PR**.
- La compuerta responde la pregunta "¿todo archivo QUE ESTÁ tiene su fila?" pero no puede responder "¿falta algún archivo que DEBERÍA estar?" — es ciega por construcción a lo que no existe en el árbol que audita.

**Clasificación**: SUGGESTION de nivel de proceso (S1 abajo) — no bloquea esta ronda, porque 0048 ya está rastreado y la compuerta real pasa. Pero es un hallazgo legítimo y no obvio sobre el propio pipeline de CI del proyecto: la compuerta que existe para prevenir exactamente este tipo de incidente (migración huérfana) no puede prevenir su variante inversa (migración faltante), y esta ronda es evidencia de que el escenario es real, no hipotético — ocurrió en este mismo PR. Lo guardo en engram por su valor no obvio para el proyecto.

---

## 9. Spec Compliance Matrix (sin cambios de fondo respecto a la ronda 1, actualizado el ítem bloqueado por C1)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| La identidad anónima no puede autenticarse | Login rechazado / sin tokens / motivo distinguible / otras credenciales intactas / forma sobrevive | `auth.service.spec.ts` + `health.e2e-spec.ts` + `sessions.e2e-spec.ts` | ✅ COMPLIANT (5/5) |
| El techo anónimo queda vacío | Config vacía / sin lectura / sin escritura | `auth.config.spec.ts` | ✅ COMPLIANT (3/3) |
| El techo anónimo queda vacío | Fila máscara vaciada | migración 0048, ejecutada en el harness e2e (`TestEnvironment` aplica `[0-9]*.sql`) + ahora rastreada en git | ✅ COMPLIANT (antes ⚠️ PARTIAL por C1 — **C1 cerrado, escala a COMPLIANT**) |
| El techo anónimo queda vacío | Efecto de 0008 anulado | 0048 no edita 0008, DOWN idéntico a lo que 0008 estableció | ✅ COMPLIANT |
| La fila máscara sobrevive | Presente / referenciable / sin rol / publica no entra | `t7-referential-integrity.e2e-spec.ts` R15.4, `auth.service.spec.ts` | ✅ COMPLIANT (4/4) |
| Ningún camino sin sesión crea contenido | Crear incidencia / crear comentario / sin puerta trasera / lectura también cerrada | `anon-no-anonymous-creation.e2e-spec.ts` (3/3 PASS) + inspección de guards | ✅ COMPLIANT (4/4) |

**Compliance summary**: 14/14 escenarios COMPLIANT (13/14 en la ronda 1; el escenario bloqueado por C1 ahora escala a COMPLIANT).

---

## 10. Coherencia — `design.md` inexistente

Sin cambios respecto a la ronda 1: este change no tiene `design.md`. La única referencia a "del design" es la circular de `0048...sql` (ver sección 5, SUGGESTION S2) — no hay una decisión citada de un `design.md` externo que no exista. `proposal.md` sí cita `AUD design.md D1/D6` para la fila máscara, documento real pero fuera de alcance de esta auditoría (AUD).

---

## 11. Hallazgos — resumen clasificado

### CRITICAL
Ninguno.

### WARNING

**W2 — Ventana de caché tibia hasta 15 min (efectiva) / 1h (nominal) tras el deploy, sin instrucción de runbook.** (heredado de la ronda 1, sigue abierto)
- `backend/src/config/auth.config.ts:71,74-76`. Ver sección 3/6 arriba para el análisis completo con los números concretos.
- No bloquea el archivado — riesgo acotado y ya evaluado por la ronda 1 — pero debería convertirse en ticket de seguimiento explícito con una instrucción de despliegue, no sólo un comentario en `tasks.md`.

**W8 — `tasks.md` A.4 y el pie "Estado de gates" quedaron stale en esta misma ronda.** (nuevo)
- `openspec/changes/back/2026-09-02-anon-close-anonymous-reporting/tasks.md:34-42,193-197`. Ver sección 4 arriba.
- Bajo impacto (documentación interna, no afecta CI real), pero es el mismo patrón recurrente del proyecto: una corrección (D.2, unas líneas más abajo) sin propagar a su vecino inmediato en el mismo archivo.

### SUGGESTION

**S1 — La compuerta de migraciones de `ci.yml` no puede detectar una migración faltante, sólo una sin registrar.**
- `.github/workflows/ci.yml:322-333`. Ver sección 8. Hallazgo de proceso, no bloqueante para esta ronda; recomendado como mejora futura de CI (ej.: comparar contra el último ID esperado, o cruzar contra los IDs de migración mencionados en los `tasks.md` de changes abiertos).

**S2 — Comentario circular en `0048_close_anonymous_ceiling.sql` cita "del design" sin que exista `design.md` para este change.**
- `database/migrations/0048_close_anonymous_ceiling.sql` (línea ~31). Heredado de la ronda 1 (su sección 7), sin corregir, cosmético — la lógica ya está bien documentada en el resto del comentario.

---

## 12. Juicio de archivado

**Se puede archivar.** Ejecuté las cinco compuertas de backend, las tres de
frontend, la compuerta de e2e completa (52/52 suites, 448/448 tests, 0
fallos, 581.5s de corrida real) y el bucle exacto de migraciones de
`ci.yml` — todas pasan con evidencia real, no asumida. El único CRITICAL de
la ronda 1 (C1, migración fuera de git) está cerrado y lo confirmé
independientemente con `git status --short` y con la compuerta real. Los
seis WARNING de la ronda 1 están cerrados con evidencia de código, no sólo
de narrativa.

Quedan dos WARNING abiertos (W2 heredado — riesgo acotado y ya evaluado
como no bloqueante por la ronda 1; W8 nuevo — documentación interna
desincronizada, sin efecto en CI real) y dos SUGGESTION de proceso/cosmética
(S1, S2). Ninguno de los cuatro es motivo para retener el archivado: no
hay lógica de aplicación incorrecta, no hay compuerta de CI real en rojo,
y no hay puerta trasera de seguridad. Recomiendo resolver W8 (mecánico,
minutos) y abrir un ticket explícito para W2 antes o inmediatamente
después del archivado, pero ninguno de los dos debe bloquear `sdd-archive`.
