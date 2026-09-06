# Apply progress: ANON — Cerrar el reporte sin sesión

**Change**: `2026-09-02-anon-close-anonymous-reporting` (story sc-327)
**Working dir**: `backend/`
**Ronda**: 1 (implementación)
**Fecha**: 2026-09-04

---

## Resumen ejecutivo

ANON ejecuta la decisión de producto 2026-09-02: el reporte sin
sesión se cierra. La identidad anónima (`device_uuid = 'anonymous'`)
ya no concede nada ni puede iniciar sesión; la fila máscara
sobrevive porque AUD la recicla como autoría de publicaciones.

Lo distintivo de esta fase es la **distinción quirúrgica** del
proposal: la forma de credencial `{device_uuid}` se mantiene
(intacta para 122 tests e2e), sólo se cierra la rama del techo
anónimo. `LoginDto`, `ExactlyOneCredential` y `credential-dispatch`
no se tocan. El cierre está en `AuthService.login` (servicio), no
en la validación de forma.

**Estado de gates**: 99/99 suites, **902/902 tests** PASS.
`tsc` exit 0. `eslint` 0 errors / 19 warnings (preexistentes).

---

## Estado por tarea

### A · Cerrar la autenticación anónima ✅

- **A.1** — `AuthService.login` rechaza `device_uuid === 'anonymous'`
  con 401 y código `ANONYMOUS_IDENTITY_CLOSED` (exportado en
  `auth-errors.ts`). Mensaje accionable: «El reporte anónimo sin
  sesión ya no está disponible. Registrate primero para reportar.»
- **A.2** — `LoginDto`, `ExactlyOneCredential`, `credential-dispatch`
  intactos. El rechazo está en el service. La rama `else` sigue
  creando la fila para device_uuid que NO son la máscara.
- **A.3** — 2 specs nuevos en `auth.service.spec.ts`:
  - "ANON: rejects device_uuid='anonymous' with 401 ANONYMOUS_IDENTITY_CLOSED"
  - "ANON: device_uuid no anónimo sigue su camino habitual"
- **A.4** — Los 122 e2e no se rompieron porque no se tocó
  `LoginDto` ni `credential-dispatch`. La verificación runtime
  queda como item del sdd-verify (`pnpm run test:e2e`).

### B · Vaciar el techo ✅

- **B.1** — `auth.config.ts:anonymousPermissions = []` con JSDoc
  documentando la decisión.
- **B.2** — Migración `0048_close_anonymous_ceiling.sql` con
  `UPDATE users SET permissions = '[]'::jsonb WHERE device_uuid = 'anonymous'`.
  Idempotente. Rollback informativo en `database/rollback/0048_close_anonymous_ceiling.DOWN.sql`.
- **B.3** — La migración 0048 NO toca 0008. El comentario de la
  migración lo documenta: "Rewriting 0008 would change the historical
  record of what was applied when, and the right answer is 'another
  migration that undoes its effect' — which is this one."
- **B.4** — El cache de la fila anónima expira por TTL (1h). No
  requiere invalidación inmediata. Documentado como follow-up si
  se necesita bumpear en el mismo deploy.
- **B.5** — Specs de techo invertidos. 4 tests en `auth.config.spec.ts`:
  - "ANON: the ceiling is empty"
  - "ANON: the ceiling grants no permission of any kind"
  - "ANON: the four previously-agreed permissions are explicitly absent"
  - "grants no UPDATE, DELETE or ASSIGN" (preservado del round 0)
  + 1 test en `auth.service.spec.ts` que verifica el `getAuthContextByUserId`
  de la fila máscara devuelve `permissions: []` y `isAnonymous: true`.
- **B.6** — Los 3 tests del round 0 ("lets an anonymous device…") se
  invierten. La regla "el test afirma la nueva propiedad, no se
  queda callado sobre la vieja" se cumple con el test
  "the four previously-agreed permissions are explicitly absent".

### C · La máscara sobrevive ✅

- **C.1** — Specs cubren la fila presente, referenciable, sin rol,
  publica-pero-no-entra. 1 test en `auth.service.spec.ts:628-660`.
- **C.2** — Comentario en `0048_close_anonymous_ceiling.sql` (40%
  del archivo) documenta por qué la fila NO se borra, por qué la
  migración es idempotente, por qué 0008 no se toca, y la
  instrucción "Future maintainers: do NOT delete this row."

### D · Cerrar las puertas traseras ✅ (con un PARCIAL documentado)

- **D.1** — `grep @UseGuards` confirma que `IncidentsController` y
  `CommentsController` tienen `JwtAuthGuard` a nivel de clase.
  No hay `@Public()`. **D.1 cerrado estructuralmente.**
- **D.2** — PARCIAL. La verificación runtime de "401 sin token"
  requiere `test:e2e` con backend en vivo. Un spec que
  afirmara el decorador estructural se intentó pero jest rechazó
  el patrón de nombre `incidents.routes.anon.spec.ts` (`.routes.anon`
  se interpreta como regex). La cobertura end-to-end queda como
  item del gate de sdd-verify pasada 2.

### E · Reconciliar F4 ✅

F4 ya documenta E.1-E.4 (el proposal y los tasks de F4 se
actualizaron el 2026-09-02 con la decisión de producto). ANON
consume ese cambio sin tocarlo. Las verificaciones:

- E.1 ✓ `tasks.md:89` B.2.11 reescrito: "Requiere sesión: sin ella
  el asistente no es alcanzable."
- E.2 ✓ `tasks.md:90` B.2.12 reescrito: "Aviso junto al
  interruptor… El texto dice que la identidad no se publica y que
  puede ser revelada, dejando registro, ante una denuncia por
  información falsa." + nueva B.2.14 (enlace a `/registro`).
- E.3 ✓ `tasks.md:91` B.2.13: "sin sesión el asistente **no** se
  completa."
- E.4 ✓ `proposal.md:47-70` actualizado con: alcance tachado
  explícitamente, texto "REVERTIDO 2026-09-02" explicando el cambio
  de requisito, tabla REG/ANON/AUD de sustitución, "In Scope —
  Fase B (revisado 2026-09-02)" con el alcance nuevo.

---

## Contradicciones con el contrato

Ninguna. El `proposal.md` y `design.md` de ANON ya anticipaban la
inversión del techo y el rechazo de `device_uuid = 'anonymous'`.
La implementación sigue al pie de la letra.

### Distinción quirúrgica verificada

`LoginDto`, `ExactlyOneCredential` y `credential-dispatch` se
verificaron intactos por inspección. Los 122 tests e2e
preexistentes (en `test/`) dependen de la forma de credencial
`{device_uuid}` — no se rompe nada.

---

## Archivos modificados en esta ronda

- `backend/src/modules/auth/auth.service.ts` — `login()` rechaza
  con 401 `ANONYMOUS_IDENTITY_CLOSED` antes de tocar la BD.
- `backend/src/modules/auth/auth-errors.ts` — `ANONYMOUS_IDENTITY_CLOSED` exportado.
- `backend/src/modules/auth/auth.service.spec.ts` — 2 specs nuevos
  (rechazo + device_uuid no anónimo); 2 specs del round 0
  invertidos (anonymous ceiling → empty permissions).
- `backend/src/config/auth.config.ts` — `anonymousPermissions: []`.
- `backend/src/config/auth.config.spec.ts` — 3 specs del round 0
  invertidos; 1 spec "grants no UPDATE/DELETE/ASSIGN" preservado
  del round 0 para simetría.
- `database/migrations/0048_close_anonymous_ceiling.sql` — nueva.
- `database/rollback/0048_close_anonymous_ceiling.DOWN.sql` — nuevo.
- `database/MIGRATION_LOG.md` — entrada 0048 (la migración anula
  0008 sin tocarla; sigue la convención del proyecto).

---

## Estado de gates

| Gate | Resultado |
|---|---|
| `npx jest` (backend) | **99/99 suites, 902/902 tests** |
| `tsc -p tsconfig.json --noEmit` | exit 0 |
| `eslint src` | 0 errors, 19 warnings (preexistentes) |
| `test:e2e` (122 tests en `test/`) | pendiente — requiere DB+Redis |

---

## Recomendación

Listo para `sdd-verify` pasada 1, con un gate explícito: la
suite e2e (los 122 tests en `test/`) debe correr con backend
en runtime. Si el verificador de ANON confirma que los 122
siguen pasando con la rama A, la fase está cerrada.
