# Verify Report — Ronda 7: F3 — Módulo de Incidencias (sc-303) — auditoría del fix de `claim`

**Change auditado**: `2026-09-07-fix-incident-claim-wiring` (`openspec/changes/front/2026-09-07-fix-incident-claim-wiring/`, uncommitted en el working tree)
**Change de origen (ya archivado)**: `openspec/changes/archive/2026-09-06-2026-08-29-f3-incidents-module/`
**Ronda auditada**: 7 — auditoría independiente y adversarial de la remediación normada por `fixes-required-ronda-6.md`
**Fecha**: 2026-09-07
**Auditor**: sdd-verify, ronda 7 (fresh context, sin participación en la implementación de ninguna ronda previa)
**Mandato**: no confiar en la prosa de `apply-progress.md` ni `tasks.md` del change de seguimiento. Releer el código fuente y el backend real, ejecutar los gates en vivo, y correr mutación real sobre el código pre-fix para probar que los tests nuevos realmente detectan el defecto.
**Modo**: Strict TDD activo. Working dir de todas las compuertas: `frontend/`. Package manager: pnpm.

---

## Veredicto sobre el fix de ronda 6

En una frase por cada uno de los 8 puntos de verificación pedidos, en lenguaje llano:

1. **La llamada de `claim` en sí** — **SE SOSTIENE.** `claimIncident()` ahora hace `POST /incidents/${id}/claim` con body `{}` y tipa la respuesta como `ClaimReleaseResult` (los mismos 7 campos que ya usa `release`, y coinciden exactamente con `ClaimReleaseResponseDto` del backend tras pasar por el interceptor snake_case).
2. **Que no se corrompan los datos en pantalla (paridad con `release`)** — **SE SOSTIENE.** Tanto el `tap()` del servicio como el `case 'claim'` del componente hacen merge parcial (`{ ...inc, ...claimed }` y `cur => ({ ...cur, ...claimed })`), no reemplazo. El mismo patrón, probado, que ya usa `release` desde la ronda 5.
3. **Que `claimed_by` realmente se escriba** — **SE SOSTIENE.** Leído el SQL literal del backend: `UPDATE incidents SET claimed_by = $1, claimed_at = NOW() WHERE id = $2 AND claimed_by IS NULL`. Es la ruta correcta y ya existía; el frontend ahora sí la usa. La cadena `claim → release/resolve` se cierra: una vez que `claimed_by` queda escrito, la condición `claimed_by === currentUserId` que exige `availableActions()` para ofrecer esos botones puede cumplirse.
4. **Los códigos de error** — **SE SOSTIENE.** `INCIDENT_ALREADY_CLAIMED` (409), `CLAIM_LIMIT_REACHED` (429) y `WRONG_ORGANIZATION` (403) existen tal cual en `incident-workflow.errors.ts` y se lanzan exactamente donde el fix de ronda 6 los citó. El componente captura el error, muestra `err.error.message` en el toast y recarga la incidencia con `getIncident()` — mismo patrón que `release`.
5. **Honestidad de los tests nuevos** — **SE SOSTIENE, y se probó con mutación real, no por lectura.** Ningún test mockea `claimIncident` con un `Incident` completo — todos usan el shape slim de 7 campos, con aserciones negativas explícitas sobre campos fuera del DTO (`description`, `lat`, `lng`, `citizen_id`, `category_id` — `toBeUndefined()`), y aserciones positivas de preservación (`description`, `lat`, `citizen_id`) después del merge. Se revirtió el código de producción a la versión pre-fix (`git checkout` de los dos `.ts`, manteniendo los `.spec.ts` nuevos) y se corrió la suite: los 3 tests nuevos/reescritos fallan de inmediato (ver evidencia abajo). No es un test que "también pasaría contra el código viejo".
6. **El gate de `workflow.util.ts`** — **SE SOSTIENE, y correctamente sin tocar.** `hasClaim = permissions.includes('CLAIM incidents')` ya exigía el permiso correcto desde la ronda 5; lo que estaba mal era la llamada, no el gate. Verificado contra el decorador real (`@RequirePermission('CLAIM', 'incidents')` en `incident-workflow.controller.ts:34`) y contra los seeds (`0015_organizations_scoping.sql` + `0019_incident_claim.sql`): `operador_sistema` tiene `CLAIM incidents` sin `UPDATE incidents`. Con el fix, ese rol ve el botón "Reclamar" y la acción llama al endpoint que exige exactamente el permiso que tiene — sin 403.
7. **Los artefactos SDD del propio change de seguimiento** — **HALLAZGO (WARNING).** `tasks.md` está marcado honestamente (las 11 casillas `[x]` corresponden a código real, verificado línea por línea). Pero `specs/frontend-incidents/` dentro del change está **vacío** — no existe `spec.md`. Ver sección de hallazgos.
8. **Compuertas en vivo** — **CONFIRMADAS, números exactos.** `pnpm test`: 60/60 suites, **419/419** tests (ronda 6 tenía 418; el fix agrega exactamente 1 test neto — 1 test nuevo en `incident.service.spec.ts`, y los 2 tests de `incident-detail.component.spec.ts` fueron reescritos in-place, no agregados). `pnpm run build`: exit 0. `npx tsc -b --noEmit`: 9 errores, mismos 3 archivos (`auth.service.spec.ts`, `placeholder.component.spec.ts`, `layout-tokens.regression.spec.ts`), 0 en archivos de incidencias. `pnpm lint` sigue sin existir (confirmado, no se inventó).

**Resumen: 0 CRITICAL sobreviven de la ronda 6. 1 WARNING nuevo (artefacto SDD faltante en el change de seguimiento, no un defecto de código). 0 regresiones detectadas en C1/C2/C3/W1/W2 ni en las 4/5 acciones ya alineadas de W2.**

---

## Compuertas (ejecutadas en vivo, 2026-09-07, working dir `frontend/`)

| Compuerta | Comando | Resultado ronda 6 (declarado) | Resultado ronda 7 (verificado ahora) |
|---|---|---|---|
| Tests | `pnpm test` | 60/60 suites, 418/418 tests | **60/60 suites, 419/419 tests** — PASS |
| Build | `pnpm run build` (`ng build`) | exit 0, 4.6s | **exit 0**, 4.4s |
| Type-check | `npx tsc -b --noEmit` | 9 errores en 3 archivos, 0 en F3 | **9 errores en los mismos 3 archivos**, 0 en archivos de incidencias |
| Lint | `pnpm lint` | no existe | confirmado: no existe (`ERR_PNPM_NO_SCRIPT`, no se corrió porque no existe) |
| E2E | `pnpm test:e2e` | no corrido (requiere `BASE_URL`+backend) | no corrido, misma convención de skip que rondas previas |

Ninguna compuerta se omitió sin ejecutar.

### Mutación real — prueba de que los tests nuevos detectan el defecto original

Se revirtió `incident.service.ts` e `incident-detail.component.ts` a su versión pre-fix (`git checkout HEAD -- ...`), dejando los `.spec.ts` nuevos intactos, y se corrió `pnpm test -- incident-detail.component incident.service.spec`:

```
FAIL src/app/core/services/incident.service.spec.ts
  ● claimIncident POSTs /incidents/:id/claim ... (ronda 6)
    TypeError: service.claimIncident is not a function

FAIL src/app/features/incidents/incident-detail/incident-detail.component.spec.ts
  ● F3.4.7 — al ejecutar claim con éxito, claimIncident devuelve un ClaimReleaseResult ...
    TypeError: Cannot read properties of undefined (reading 'subscribe')
  ● F3.4.7 — al fallar el claim, el toast expone el mensaje del backend y se recarga la incidencia
    TypeError: Cannot read properties of undefined (reading 'subscribe')

Test Suites: 2 failed, 2 total
Tests:       3 failed, 19 passed, 22 total
```

Los 3 tests nuevos/reescritos fallan contra el código pre-fix exactamente como se espera. Se restauraron los archivos de producción al estado del working tree (`cp` desde copia previa) y se re-corrió la suite completa: 60/60 suites, 419/419 tests — sin diferencias respecto al estado antes de la mutación. El working tree quedó exactamente como se encontró.

---

## Verificación punto por punto (evidencia técnica)

### 1. La llamada de `claim`

`frontend/src/app/core/services/incident.service.ts` (nuevo método, +30 líneas):

```ts
claimIncident(id: string): Observable<ClaimReleaseResult> {
  return this.httpService
    .post<ClaimReleaseResult>(`/incidents/${id}/claim`, {})
    .pipe(
      tap((claimed) => {
        const current = this.incidents$.value.map((inc) =>
          inc.id === id ? { ...inc, ...claimed } : inc,
        );
        this.incidents$.next(current);
      }),
    );
}
```

- URL: `POST /incidents/${id}/claim` — coincide con el endpoint dedicado del backend (`incident-workflow.controller.ts:34`, `@Post(':id/claim')`).
- Body: `{}` — correcto, el endpoint no requiere payload (el `operator` sale del JWT vía `@Req()`).
- Tipo de retorno: `Observable<ClaimReleaseResult>`, mismo tipo que ya usa `releaseIncident()`. `ClaimReleaseResult` (`incident.model.ts:97-105`) declara `id, title, status, priority, claimed_by, organization_id, updated_at` — 7 campos, snake_case. Cruzado contra `ClaimReleaseResponseDto` (`backend/.../dto/claim-release-response.dto.ts`): mismos 7 campos, en camelCase en el DTO (`claimedBy`, `organizationId`, `updatedAt`). El `SnakeCaseResponseInterceptor` (registrado globalmente en `main.ts`, confirmado en ronda 6) convierte cualquier respuesta a snake_case antes de llegar al cliente, así que el wire real que ve el frontend es exactamente el shape de `ClaimReleaseResult`. No hay mismatch de tipos — es el mismo tipo compartido que ya certificó C2 para `release`.
- Merge en cache: `inc.id === id ? { ...inc, ...claimed } : inc` — parcial, no reemplazo.

### 2. Paridad de merge con `release`

`incident-detail.component.ts`, `case 'claim'`:

```ts
this.incidentService.claimIncident(inc.id).subscribe({
  next: (claimed) => {
    this.incident.update((cur) => (cur ? { ...cur, ...claimed } : cur));
    ...
```

Idéntico patrón a `case 'release'` (`{ ...cur, ...released }`). Ninguna rama reemplaza el signal completo (`.set(claimed)` en vez de `.update(cur => ({...cur, ...claimed}))`), que es exactamente el bug que C2 corrigió para `release` en la ronda 5. No se reintrodujo para `claim`.

### 3. Que `claimed_by` se escriba de verdad

`backend/src/modules/incidents/incident-workflow.service.ts:111-118` (sin cambios respecto a rondas anteriores — el endpoint ya funcionaba, sólo estaba sin usar):

```sql
UPDATE incidents
   SET claimed_by = $1, claimed_at = NOW()
 WHERE id = $2 AND claimed_by IS NULL
 RETURNING id, title, status, priority, claimed_by, organization_id, updated_at
```

CAS atómico (0 filas afectadas ⇒ `ConflictException(INCIDENT_ALREADY_CLAIMED)`). Con `claimed_by` escrito, `availableActions()` (`workflow.util.ts:64,72`) puede evaluar `incident.claimed_by === currentUserId` como verdadero para el operador que reclamó, habilitando `release` y `resolve`. La cadena que la ronda 6 documentó como rota (reclamar → nunca poder liberar/resolver) ahora se cierra.

### 4. Rutas de error

Confirmado en `backend/src/modules/incidents/incident-workflow.errors.ts`:
```ts
export const INCIDENT_ALREADY_CLAIMED = 'INCIDENT_ALREADY_CLAIMED';
export const WRONG_ORGANIZATION = 'WRONG_ORGANIZATION';
export const CLAIM_LIMIT_REACHED = 'CLAIM_LIMIT_REACHED';
```
Lanzados en `claim()`: `ForbiddenException(WRONG_ORGANIZATION)` (organización distinta, sin escape para system-admin), `HttpException(CLAIM_LIMIT_REACHED, 429)` (tope `max_active_claims` alcanzado), `ConflictException(INCIDENT_ALREADY_CLAIMED, 409)` (CAS miss). El componente:
```ts
error: (err) => {
  const message = err?.error?.message ?? 'No se pudo reclamar la incidencia.';
  this.toast.show(message, 'error');
  this.incidentService.getIncident(inc.id).subscribe({ next: (refreshed) => this.incident.set(refreshed) });
},
```
Mismo patrón que `release`, probado con un test de error que usa `INCIDENT_ALREADY_CLAIMED` como mensaje mockeado y verifica el toast.

### 5. Honestidad de los tests (detalle)

`incident.service.spec.ts` — nuevo test `claimIncident POSTs ... (ronda 6)`:
- Aserciones positivas de los 7 campos de `ClaimReleaseResult`, incluyendo `claimed_by === 'user-1'` (la aserción que faltaba desde la ronda 3).
- Aserciones negativas: `(res as any).description`, `.lat`, `.lng`, `.citizen_id`, `.category_id` → todas `toBeUndefined()`. Ningún test mockea con un `Incident` completo.
- Aserción de cache: `cached.claimed_by === 'user-1'`, `cached.description` y `cached.lat` preservados (no borrados por el merge).

`incident-detail.component.spec.ts` — 2 tests reescritos (no se agregó un tercero; el conteo neto de tests del archivo no cambia, el +1 total viene sólo del service spec):
- Éxito: mock de `claimIncident` (no `updateIncidentStatus`) con `claimed_by: 'user-1'`; afirma `incidentSvc.claimIncident).toHaveBeenCalledWith('inc-1')`, `incidentSvc.updateIncidentStatus).not.toHaveBeenCalled()` (aserción negativa explícita — evita que un mock fantasma pase), `component.incident()?.claimed_by === 'user-1'`, y preservación de `description`, `lat`, `citizen_id`.
- Error: mock de `claimIncident` con `throwError(() => ({ error: { message: 'INCIDENT_ALREADY_CLAIMED' } }))`, afirma el toast con ese mensaje exacto.

Mutación real ejecutada (ver sección de Compuertas arriba): los 3 tests fallan contra el código pre-fix. Esto satisface la regla del proyecto: "un test que pasaría contra el código pre-fix no prueba nada" — aquí no es el caso.

### 6. Gate de `workflow.util.ts`

Archivo **no modificado** (confirmado por `git diff --stat`, no aparece en la lista de archivos cambiados). Se verificó que esto es correcto, no una omisión:
- `hasClaim = permissions.includes('CLAIM incidents')` (línea existente desde la ronda 5).
- Decorador real: `@RequirePermission('CLAIM', 'incidents')` en `incident-workflow.controller.ts:34` — coincide exactamente.
- Seeds reales: `0015_organizations_scoping.sql:74-83` siembra `operador_sistema` con sólo `READ incidents/comments/assignments/geo-zones/incident-categories/organizations` (sin `UPDATE`, sin `CLAIM`). `0019_incident_claim.sql:39-42` agrega `CLAIM incidents` y `RELEASE incidents` a `operador_organizacion` y `operador_sistema` vía `UPDATE ... SET permissions = permissions || ...`. Resultado neto: `operador_sistema` tiene `READ, CLAIM, RELEASE incidents`, sin `UPDATE incidents` — exactamente el set que la ronda 6 documentó.
- Con el fix, el botón "Reclamar" (visible para este rol desde la ronda 5) ahora invoca `POST /:id/claim`, que exige `CLAIM incidents` — el rol lo tiene. No hay 403. La regresión de autorización de la ronda 5 queda cerrada como efecto colateral correcto de este fix, tal como predijo `fixes-required-ronda-6.md` punto 5.

### 7. Artefactos SDD del change de seguimiento — WARNING

`openspec/changes/front/2026-09-07-fix-incident-claim-wiring/`:
- `proposal.md` — presente, describe el problema y el scope con precisión (verificado contra el código real, no es prosa optimista).
- `tasks.md` — 11 casillas, todas `[x]`. Se verificaron una por una contra el diff real: **honestas**, ninguna marcada sin respaldo en código. La sección 3 ("No tocar") también se cumplió: `workflow.util.ts`, `resolve`/`close`, y `spec.md` efectivamente no fueron tocados, y por las razones correctas (verificado arriba).
- `apply-progress.md` — presente, detallado, incluye una tabla de verificación por mutación (1 mutación documentada, coincide con lo que esta ronda 7 volvió a ejecutar de forma independiente y obtuvo el mismo resultado).
- `specs/frontend-incidents/` — **existe como directorio pero está vacío. No hay `spec.md`.**

Esto es una desviación de la convención SDD: todo change que declara una capacidad de negocio (aunque sea un fix de wiring, no una feature nueva) debería llevar un `spec.md` de delta, aunque sea uno que declare explícitamente "sin delta — este fix hace que el código cumpla el escenario ya descrito en `openspec/specs/frontend-incidents/spec.md:67-68`". Ese `spec.md` de referencia (el del proyecto, fuera del change) ya describe correctamente el comportamiento esperado ("Reclamar — ... THEN queda asignada al usuario actual") y no fue tocado — con razón, porque ya era correcto y el fix lo hace real. Pero la ausencia total de un `spec.md` dentro de la carpeta del change (ni siquiera uno que documente "no delta") es un gap de proceso, no de código. Se clasifica **WARNING**, no CRITICAL: no hay contradicción funcional, sólo un artefacto de trazabilidad SDD faltante.

### 8. Compuertas

Ver tabla arriba. Todos los números declarados en `apply-progress.md` (419/419 tests, build exit 0, 9 errores tsc preexistentes) se confirmaron exactos, ejecutando los comandos de forma independiente, no leyendo la prosa.

---

## Re-verificación de hallazgos previos (sin regresión)

- **C1** (filtros/paginación decorativos) — sigue cerrado. Ningún archivo tocado por este fix se relaciona con C1.
- **C2** (`release` con tipo/merge correcto) — sigue cerrado. `release` no fue tocado por este fix; se usó como plantilla para `claim`.
- **C3** (e2e/autorización de rutas) — sigue cerrado, sin cambios relacionados.
- **W1** (`spec.md` honesto) — sigue cerrado. El escenario "Reclamar" que antes contradecía el código ahora es literalmente cierto: `claimed_by` sí queda asignado al usuario actual tras un claim exitoso.
- **W2** (permisos alineados 4/5 acciones) — **ahora 5/5.** El único hueco (`claim`) que ronda 6 documentó como "alineación cosmética" se cerró: la llamada real ahora exige exactamente el permiso (`CLAIM incidents`) que el gate de visibilidad ya pedía.

---

## Coherence (Design)

| Decisión | ¿Se siguió? | Notas |
|---|---|---|
| D1 — afirmar sobre campos mapeados, no sobre la URL | ✅ Sí | El nuevo test de servicio y el de componente afirman `toHaveBeenCalledWith`/URL exacta Y sobre `claimed_by` — ambas cosas, no sólo una |
| D4 — "ocultar un botón es ergonomía, no control", el servidor es la autoridad | ✅ Sí | Los 3 códigos de error del servidor (409/429/403) se manejan con toast + recarga, igual que `release` |
| W2 (ronda 5→7) — permisos por acción alineados al backend real | ✅ 5/5 acciones | `claim` se suma a `release`/`resolve`/`close`/`assign` |

---

## Issues Found

### CRITICAL (must fix before archive)

Ninguno. El único CRITICAL de la ronda 6 se remedió por completo y se verificó con evidencia de ejecución real (mutación, gates, lectura de SQL/decoradores/seeds), no por lectura de prosa.

### WARNING

**W-R7.1** — El change de seguimiento `2026-09-07-fix-incident-claim-wiring` no incluye un `spec.md` de delta en `specs/frontend-incidents/` (el directorio existe pero está vacío). Ver detalle en el punto 7 arriba y en `fixes-required-ronda-7.md`.

### SUGGESTION

Ninguna nueva. El comentario de `workflow.util.ts:55-58` ya es preciso ahora que el wire real coincide con lo que documenta — la sugerencia S1 de la ronda 6 quedó resuelta como efecto colateral del fix, sin necesidad de tocar el archivo.

---

## Veredicto sobre archivo

El change ya archivado `2026-09-06-2026-08-29-f3-incidents-module` **no necesita ninguna acción adicional** — su CRITICAL pendiente (documentado en `verify-report-ronda-6.md`) fue remediado en su totalidad por el change de seguimiento, con evidencia de ejecución real, no de prosa.

El change de seguimiento `2026-09-07-fix-incident-claim-wiring` **no está listo para `sdd-archive` todavía** — no por el código (que es correcto y está probado), sino por el artefacto SDD faltante (W-R7.1). Recomendación: agregar un `spec.md` mínimo a `specs/frontend-incidents/` dentro de la carpeta del change (aunque sea "sin delta de comportamiento — este change hace que la implementación cumpla el escenario `Reclamar` ya descrito en el spec sincronizado del proyecto") y entonces sí archivar. No hace falta una nueva ronda de `sdd-verify` para ese paso — es un gap puramente documental, no de código.

---

## Verdict

**PASS WITH WARNINGS** — 0 CRITICAL, 1 WARNING (artefacto SDD faltante en el change de seguimiento, no defecto de código), 0 SUGGESTION nuevas. El fix de `claim` documentado en `fixes-required-ronda-6.md` está completo, correcto, y probado con mutación real. No hay regresiones en C1/C2/C3/W1/W2 (ahora 5/5). El módulo de incidencias F3 puede considerarse funcionalmente completo tras 7 rondas de auditoría independiente.
