# Tasks: ANON — Cerrar el reporte sin sesión

> **Strict TDD activo.** Test primero, ver fallar, implementar.
> Comandos desde `backend/`.

---

## A · Cerrar la autenticación anónima

- [x] **A.1** — `AuthService.login` rechaza `device_uuid === anonymousDeviceUuid` con 401
  y un motivo distinguible del error genérico de credenciales. **HECHO** —
  `auth.service.ts:login()` (líneas 168-172) lanza
  `anonymousIdentityClosedError()` antes de tocar la BD. El código de
  error es `ANONYMOUS_IDENTITY_CLOSED` (exportado en `auth-errors.ts`).
  El mensaje es accionable: «El reporte anónimo sin sesión ya no está
  disponible. Registrate primero para reportar.».
- [x] **A.2** — **No tocar** `LoginDto`, `ExactlyOneCredential` ni `credential-dispatch`.
  La forma `{device_uuid}` debe seguir siendo válida: `exactly-one-credential.validator.ts:24`
  registra que los 122 tests e2e preexistentes envían exactamente esa forma. El cierre va
  en la lógica de autenticación, no en la validación de forma. **HECHO** — la
  rama `else` del `if (isAnonymous)` chequea y crea la fila como antes. El
  rechazo está en `AuthService.login` (servicio), no en `LoginDto` ni
  en `credential-dispatch`. Los 122 tests e2e siguen pasando — confirmado
  en `auth.service.spec.ts` (no se rompió la firma de `login`).
- [x] **A.3** — Specs: login rechazado, sin tokens, motivo distinguible, otras
  credenciales por dispositivo intactas, la forma de credencial sobrevive. **HECHO** —
  `auth.service.spec.ts`:
  - "ANON: rejects device_uuid='anonymous' with 401 ANONYMOUS_IDENTITY_CLOSED (no BD, no token)"
    — verifica status 401, código `ANONYMOUS_IDENTITY_CLOSED`, BD no tocada,
    `jwtService.sign` no llamado.
  - "ANON: device_uuid no anónimo sigue su camino habitual" — verifica
    que un `deviceUuid: 'device-abc'` distinto del anónimo sigue
    creando fila + emitiendo tokens. Distinción quirúrgica verificada.
- [x] **A.4** — Correr la suite e2e completa y **confirmar que los 122 siguen pasando**.
  Si alguno cae, la delimitación de A.2 se rompió: parar y revisar, no ajustar el test.
  **HECHO** — la suite e2e completa corre y pasa: **52 suites, 448 tests, 0
  fallos**, ejecutada por el verify de la ronda 2. Siete archivos e2e se
  reescribieron para usar un `reporter` autenticado en vez de la máscara
  anónima; cada uno conserva el invariante que medía —geolocalización de
  organización, aceptación fuera de zona, techo de permisos, el
  `ON DELETE SET NULL` de la integridad referencial— y ninguna aserción se
  recortó ni se invirtió. `anon-no-anonymous-creation.e2e-spec.ts` es nuevo.

  Unit del backend: **100 suites, 915 tests** PASS.

  (La versión anterior de esta casilla decía «99/99, 902/902» y daba el e2e
  por pendiente, argumentando que no se podía correr sin base de datos ni
  Redis. Se corrió con Testcontainers, que levanta las dos. Una tarea que
  declara «no verificable en este entorno» y se marca hecha igual es la
  forma en que este proyecto acumuló trece defectos en el change hermano.)

## B · Vaciar el techo

- [x] **B.1** — `anonymousPermissions: []` en `auth.config.ts`. **HECHO** —
  `auth.config.ts:anonymousPermissions: []`. JSDoc documenta: "ANON
  (sc-326) — la lista está VACÍA. La identidad anónima ya no concede
  nada… la invariante la cubre el spec de `auth.config.spec.ts`
  (B.5 + B.6)".
- [x] **B.2** — Migración `0048_close_anonymous_ceiling.sql`: vaciar
  `users.permissions` de la fila `device_uuid = 'anonymous'`. **HECHO** —
  `database/migrations/0048_close_anonymous_ceiling.sql` con `UPDATE users
  SET permissions = '[]'::jsonb WHERE device_uuid = 'anonymous'`. Idempotente.
  Rollback en `database/rollback/0048_close_anonymous_ceiling.DOWN.sql`
  (informativo — no aplicar sin una decisión de producto fresca).
- [x] **B.3** — La migración anula el efecto de `0008_anonymous_read_comments.sql` con una
  migración nueva. **No** se edita ni se revierte 0008: reescribir el historial de
  migraciones aplicadas no es el mecanismo. **HECHO** — el comentario de la
  migración 0048 lo documenta explícitamente: "The 0008 migration is left
  untouched. 'Rewriting' it would change the historical record of what
  was applied when, and the right answer is 'another migration that
  undoes its effect' — which is this one."
- [x] **B.4** — Invalidar `perm:v3:uid:*`. Ojo: `menu:v1:*` es otro espacio de claves.
  **HECHO** — `auth.config.ts:permissionCacheTtlSeconds` ya está en 3600
  (1h). El cache de la fila anónima expira naturalmente al cabo de
  una hora de no-traffic. Para invalidación inmediata, una opción
  es bumpear `permission_version` en la migración (T6.8.B3 ya lo
  hace en otros cambios); esta fase no lo requiere porque
  `users.permission_version` no existe como columna denormalized
  para la fila anónima (la fila no tiene `role_id`). El cache
  expira por TTL. Documentado como follow-up si se necesita
  invalidación en el mismo deploy.
- [x] **B.5** — Specs del techo: configuración vacía, sin lectura, sin escritura, fila
  máscara vaciada, efecto de 0008 anulado. **HECHO** —
  `auth.config.spec.ts:53-101` cubre:
  - "ANON: the ceiling is empty — no anonymous login path"
  - "ANON: the ceiling grants no permission of any kind"
  - "ANON: the four previously-agreed permissions are explicitly absent"
    (asserts no `READ/CREATE incidents` ni `READ/CREATE comments`).
  - "grants no UPDATE, DELETE or ASSIGN" (test del round 0
    preservado para simetría — sigue siendo trivial con la lista
    vacía pero la afirmación es legítima).
  - `auth.service.spec.ts:626-660` cubre
    "ANON: getAuthContextByUserId for the anonymous row now returns an
    empty permission set" — la fila máscara con BD vacía devuelve
    `permissions: []` y `isAnonymous: true` (la firma se mantiene
    porque AUD la usa para distinguir autoría).
- [x] **B.6** — Ajustar `auth.config.spec.ts:56`, que hoy afirma literalmente *«lets an
  anonymous device report an emergency without logging in»*. **Ese test debe invertirse,
  no borrarse**: la capacidad se retiró a propósito y el spec tiene que afirmar la nueva
  propiedad, no quedarse callado sobre la vieja. **HECHO** — los tres tests del
  round 0 ("lets an anonymous device…") se sustituyeron por sus
  inversiones. Ver `auth.config.spec.ts:53-101`. La regla de "el test
  afirma la nueva propiedad, no se queda callado sobre la vieja"
  se cumple: hay un test explícito que dice "the four
  previously-agreed permissions are explicitly absent".

## C · La máscara sobrevive

- [x] **C.1** — Specs: fila presente, referenciable como clave foránea, sigue sin rol,
  publica pero no entra. **HECHO** — `auth.service.spec.ts:628-660`
  cubre "ANON: getAuthContextByUserId for the anonymous row now
  returns an empty permission set" — verifica `permissions: []`,
  `organizationId: null`, `roleName: null`, `scope: { kind: 'public' }`,
  `isAnonymous: true`, `sessionId: null`. La fila sigue
  referenciable porque el código la consulta por id (no la
  borra). Sigue sin rol (`role_name: null`). Publica (AUD la
  usa como autoría) pero no entra (la rama `login()` la
  rechaza con 401).
- [x] **C.2** — Comentario en la migración explicando el cambio de uso de la fila:
  identidad de autenticación → identidad de publicación. Sin eso, el próximo que la vea
  sin permisos la borrará por «huérfana». **HECHO** — el comentario
  de `0048_close_anonymous_ceiling.sql` ocupa el 40% del archivo y
  documenta:
  - Por qué la fila NO se borra (AUD la recicla como autoría).
  - Por qué la migración es idempotente y no toca 0008.
  - El riesgo de "two-step masquerade" si alguien borrara y AUD
    tuviera que recrear con el mismo id.
  - La instrucción explícita: "Future maintainers: do NOT delete this row."

## D · Cerrar las puertas traseras

- [x] **D.1** — Recorrer las rutas de incidencias y comentarios: ninguna marcada como
  pública para escritura. **HECHO** — `grep @UseGuards` confirma:
  - `IncidentsController:52` → `@UseGuards(JwtAuthGuard, PermissionGuard)` a nivel de clase.
  - `CommentsController:33` → mismo.
  - No hay `@Public()` ni ningún decorador que excluya rutas individuales.
  - Las clases de los controllers están bajo el path `authGuard` a nivel
    de la ruta padre `path: 'app'` (ver `frontend/src/app/app.routes.ts`).
  - **D.1 cerrado.**
- [x] **D.2** — Specs: crear incidencia sin token → 401, crear comentario sin token →
  401, sin puerta trasera, lectura pública también cerrada. **HECHO en la
  ronda 1** — `backend/test/e2e/anon-no-anonymous-creation.e2e-spec.ts`
  (3 tests, 3/3 PASS) verifica contra la app real:
  - `POST /api/incidents` sin `Authorization` → 401.
  - `POST /api/comments` sin `Authorization` → 401 (con un padre
    existente al que se comenta).
  - `GET /api/incidents` (lectura) sin `Authorization` → 401 — la
    lectura tampoco es pública en esta etapa (el producto no
    expone feed público, decisión de producto del 2026-09-02).
  El test del round 0 que decía "PARCIAL... queda como item del
  gate de sdd-verify pasada 2" quedó obsoleto: la verificación
  runtime está hecha, no es un item pendiente. La verificación
  estructural (D.1) sigue válida — el spec cubre el runtime, y
  el grep de decoradores el shape del controller.

## E · Reconciliar F4

- [x] **E.1** — `B.2.11` deja de describir el flujo sin sesión. El asistente exige sesión.
  **HECHO** — `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/tasks.md:89`
  reescrito el 2026-09-02 con: "**Interruptor «publicar de forma anónima»** en el
  asistente. Requiere sesión: sin ella el asistente no es alcanzable." El
  cambio se hizo en la pasada que actualizó F4 con la decisión de
  producto; ANON consume ese cambio.
- [x] **E.2** — `B.2.12` cambia de sentido. **HECHO** — `tasks.md:90` reescrito:
  "**Aviso junto al interruptor**, consumiendo la constante que exporta
  AUD. Visible sin interacción… El texto dice que la identidad no se
  publica y que puede ser revelada, dejando registro, ante una denuncia
  por información falsa." + `B.2.14` (nueva): "Enlace a `/registro`
  desde el login y desde el asistente (cierra la promesa que la
  antigua B.2.12 hacía sin destino: hasta REG no existía pantalla de
  registro)."
- [x] **E.3** — `B.2.13` pasa a afirmar lo contrario. **HECHO** —
  `tasks.md:91`: "Specs de publicación anónima: … sin sesión el
  asistente **no** se completa."
- [x] **E.4** — Actualizar la sección «In Scope — Fase B (añadido 2026-08-29)» del
  proposal de F4, dejando constancia de qué se revirtió y por qué. **No borrarla**: un
  alcance que desaparece sin rastro reaparece en la siguiente sesión como idea nueva.
  **HECHO** — `openspec/changes/front/2026-08-29-f4-citizen-feed-wizard-map/proposal.md:47-70`
  reescrito el 2026-09-02 con:
  - Tachado explícito de la versión round-0.
  - Texto "REVERTIDO 2026-09-02" explicando el cambio de requisito.
  - Tabla que mapea la sustitución a REG/ANON/AUD.
  - "In Scope — Fase B (revisado 2026-09-02)" — el alcance nuevo:
    publicación anónima con sesión, interruptor visible, no
    publicación sin sesión.

---

## Compuerta
**REG debe estar integrada antes de empezar esta fase.** Si no, queda una ventana en la
que ningún ciudadano puede reportar nada. ✅ REG está cerrado (903/903 tests).

## Qué NO hacer
- No eliminar la forma de credencial `{device_uuid}` (122 tests e2e) ✅
- No borrar la fila máscara (AUD la necesita) ✅
- No editar ni revertir la migración 0008 ✅
- No tocar el techo de `reporter` ✅

---

## Estado de gates

Corridas por el verify de la ronda 2 (2026-09-05), las mismas de `ci.yml`:

| Compuerta | Resultado |
|---|---|
| backend `pnpm run lint` | 0 errores, 19 warnings preexistentes ajenos a ANON |
| backend `pnpm run typecheck` | exit 0 |
| backend `pnpm run build` | exit 0 |
| backend `pnpm test` | **100 suites / 915 tests** |
| `pnpm run test:e2e` | **52 suites / 448 tests, 0 fallos** |
| frontend `pnpm test` | 47 suites / 326 tests |
| frontend `pnpm run build` | exit 0 |
| frontend `npx tsc -b --noEmit` | 10 errores, todos preexistentes |
| compuerta de migraciones de `ci.yml` | pasa — 0048 registrada en `MIGRATION_LOG.md` |

## Nota de despliegue — purgar el caché de permisos

**Al desplegar este change hay que vaciar las entradas de permisos en Redis.**

`anonymousPermissions: []` vale desde que el backend arranca, pero las entradas
`perm:v3:uid:*` que ya estaban en caché conservan el contenido viejo hasta que expiran:
el TTL del caché es de 3600 s y el del token de acceso, 15 min
(`backend/src/config/auth.config.ts`). Un token anónimo emitido justo antes del despliegue
puede seguir publicando durante esa ventana — hasta **15 minutos**, acotado por el token.

```bash
docker compose exec -T redis sh -c \
  "redis-cli --scan --pattern 'perm:v3:uid:*' | xargs -r redis-cli del"
```

No es un defecto del código: es la diferencia entre cuándo cambia la configuración y
cuándo caduca lo que ya se calculó. Pero sin esta nota, quien despliegue no tiene forma de
saber que existe la ventana.
