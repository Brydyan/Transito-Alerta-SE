# Apply progress: AUD — Auditoría y revelación de autoría sellada

**Change**: `2026-09-02-aud-audit-trail-and-identity-reveal` (story sc-327)
**Working dir**: `backend/`
**Ronda**: 1 (implementación)
**Fecha**: 2026-09-06

---

## Resumen ejecutivo

AUD ejecuta la decisión de producto 2026-09-02: la identidad
de una publicación anónima queda sellada y sólo `master`
puede romper el sello, dejando registro. La fase depende
de que ANON (sc-326) ya haya cerrado el login anónimo y
dejado la fila `users.device_uuid = 'anonymous'` disponible
como autoría "mostrada" para las publicaciones anónimas.

La fase entrega los cuatro bloques del design:
- **A** Auditoría genérica (D3) — tabla `audit_events` con
  append-only y un `AuditService` que sólo expone `record(...)`.
- **B** Autoría sellada (D1) — tabla `incident_reporters`
  separada de `incidents` para que el endurecimiento futuro
  sea migración, no reescritura.
- **C** Permiso y revelación (D4/D5) — `REVEAL incidents` se
  concede únicamente a `master`. La revelación es `POST` (no
  `GET`) y exige `justification` de ≥ 20 caracteres.
- **D** Máscara y aviso (D2/D6) — la máscara publica pero no
  autentica; el aviso normativo se exporta como constante
  para que F4 lo consuma en vez de redactarlo.

**Estado de gates (medido)**: backend unit **105/105 suites,
944/944 tests** PASS; backend e2e **52/52 suites, 448/448
tests** PASS; `tsc` exit 0; `eslint` 0 errors.

---

## A · Auditoría genérica ✅

### A.1 — Migración 0045_audit_events.sql
- Tabla con `id`/`actor_id`/`action`/`resource_type`/
  `resource_id`/`justification`/`metadata`/`created_at`.
- `justification` nullable en el esquema, obligatorio por
  acción (D3).
- Índices `(resource_type, resource_id, created_at DESC)` y
  `(actor_id, created_at DESC)`.
- **Fix en el camino**: las FKs llevan `ON DELETE RESTRICT`
  explícito para satisfacer la compuerta R32.1 (t7-integrity-referential.e2e-spec.ts
  falla si hay FKs con `delete_rule = NO ACTION` implícito).

### A.2 — Entidad TypeORM `AuditEventEntity`
- `@ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })`
  sobre `actor`.
- `justification!: string | null` — coincide con la BD.

### A.3 — `AuditService` con una sola operación pública
- `record(input, manager?)` inserta una fila. El `manager`
  opcional permite compartir la transacción con la acción
  auditada (D4).
- **Garantía estructural**: el spec `audit.service.spec.ts`
  fija que los únicos métodos del servicio son `record` y el
  `constructor` heredado. `update` y `delete` no existen y
  no pueden añadirse sin romper el test.

### A.4 — La escritura comparte transacción con la acción
- El test `A.4: record() con manager usa el repo del
  EntityManager` verifica que cuando el llamador pasa un
  `manager`, el INSERT va contra `manager.getRepository(...)`
  y NO contra `this.repo`. Es la condición que D4 exige: una
  falla del `audit.record` dentro de la misma transacción
  hace rollback de la acción auditada.

### A.5 — Specs (8 tests, 8/8 PASS)
- Registro escrito con todos los campos.
- El servicio NO expone `update` ni `delete` (verificación
  estructural: `Object.getOwnPropertyNames(proto)`).
- `record()` sin manager usa el repo por defecto.
- `record()` con manager usa el repo del EntityManager.
- Si la escritura falla, el error se propaga (la acción NO
  debe quedar hecha).
- `metadata` default `{}` cuando el llamador omite el campo.
- `resourceId` default `null` cuando el llamador omite el campo.
- `justification` default `null` cuando el llamador omite el campo.

---

## B · Autoría sellada ✅

### B.1 — Migración 0046_incident_reporters.sql
- Tabla `incident_reporters` (PK `incident_id` FK 1:1 con
  `ON DELETE CASCADE`, `user_id` FK con `ON DELETE RESTRICT`,
  `created_at`).
- Columna `incidents.is_anonymous boolean NOT NULL DEFAULT false`.
- Índice `idx_incident_reporters_user (user_id, created_at DESC)`.

### B.2 — Entidad `IncidentReporterEntity`
- `eager: false` deliberado. Que aparezca en una respuesta
  tiene que costar escribirlo.
- `OneToOne` con `incidents` (CASCADE) y `ManyToOne` con
  `users` (RESTRICT).

### B.3 — `IncidentsService.create` acepta `is_anonymous`
- Si `dto.is_anonymous === true`:
  1. Resuelve el id de la máscara vía `dataSource.query`
     (`SELECT id FROM users WHERE device_uuid = $1`).
  2. Abre `dataSource.transaction(async (manager) => { ... })`.
  3. `repo.create({ ...citizenId: maskId, isAnonymous: true })`.
  4. `manager.query('INSERT INTO incident_reporters ...')`.
- Si la máscara no existe, lanza con mensaje explícito
  ("Migrations 0001 and 0048 must be applied").
- Si el INSERT de `incident_reporters` falla, la transacción
  rechaza y nada queda escrito.

### B.4 — Cambio de semántica documentado
- Cabecera de `IncidentEntity.citizenId` documenta el
  cambio: pasa de "la persona" a "la autoría mostrada".
- Cabecera de `IncidentEntity.isAnonymous` documenta la
  marca.
- Cabecera de `IncidentReporterEntity` documenta el acceso
  protegido por REVEAL.
- Comentario de la migración 0046 documenta la decisión y
  el patrón "no se puede `is_anonymous` y filtrar en la API
  porque una ruta nueva que olvide filtrar filtra la
  identidad" (R-AUD-1, escenario "El detalle no filtra").

### B.5/B.6 — Specs (6 tests, 6/6 PASS)
- `is_anonymous=true` → `citizen_id` apunta a la máscara y
  fila en `incident_reporters` con el autor real, misma
  transacción.
- `is_anonymous=true` con máscara ausente → lanza (el
  operador debe correr 0001 + 0048).
- `is_anonymous=false` → sin máscara, sin transacción.
- `is_anonymous` omitido → default `false` (compatibilidad
  con clientes preexistentes).
- El resultado de `create` NO contiene el id del autor real
  (defensa contra el patrón "regla a medias").
- Fallo del INSERT de `incident_reporters` hace rollback de
  la incidencia (D2).

### B.6 — Regresión sobre el resto de los endpoints
- La fila de `incident_reporters` **no** está incluida en
  el `SELECT_COLUMNS` de `incidents.repository`. Ningún
  endpoint que devuelva una incidencia —`GET /incidents`,
  `GET /incidents/:id`, `GET /incidents/stats`, `GET
  /incidents/feed`, `GET /incidents/export`— carga el autor
  real. El spec de B.5 fija que la única operación que
  entrega la identidad del autor es `POST
  /incidents/:id/reveal-reporter` (protegido por REVEAL).

---

## C · Permiso y revelación ✅

### C.1/C.2/C.3 — Migración 0047_reveal_permission.sql
- `DROP CONSTRAINT permissions_action_check` y recrear con
  `REVEAL` añadido.
- `INSERT INTO permissions (resource, action) VALUES
  ('incidents', 'REVEAL') ON CONFLICT DO NOTHING`.
- `UPDATE roles SET permissions = permissions ||
  '["REVEAL incidents"]'::jsonb WHERE name = 'master' AND NOT
  (permissions ? 'REVEAL incidents')`.
- `UPDATE users SET permissions = (subquery de roles),
  permission_version = permission_version + 1 WHERE role_id =
  master`. Bumpea `permission_version` para invalidar
  `perm:v3:uid:*` (C.3).

### C.4 — RevealIncidentDto
- `justification: string` con `@MinLength(20)` y
  `@MaxLength(2000)`.
- `case_ref?: string` con `@MaxLength(200)`, opcional.

### C.5/C.6 — Endpoints en `IncidentsController`
- `POST /incidents/:id/reveal-reporter` —
  `@RequirePermission('REVEAL')`. Es `POST` (D4), no `GET`.
- `GET /incidents/:id/reveals` — `@RequirePermission('REVEAL')`.

### C.7/C.8/C.9 — Specs (9 tests, 9/9 PASS)
- C.8: revel de una anónima registra en `audit_events` con
  `actor`, `action`, `resource`, `justification`.
- C.8: `case_ref` opcional se persiste en `metadata.case_ref`.
- C.8: `case_ref` ausente → `metadata = {}`.
- C.8: dos revelaciones producen dos registros (no se
  consolidan).
- C.8: la incidencia no existe → 404.
- C.8: la incidencia no es anónima → 404 (D4, "Incidencia no
  anónima").
- C.8: la auditoría y el lookup del autor viven en la misma
  transacción (D2). Si `audit.record` lanza, la promesa
  rechaza.
- C.7: `listReveals` devuelve el historial ordenado por
  `created_at` asc.
- C.7: `listReveals` con `case_ref = null` lo devuelve como
  `null` (no `undefined`).
- C.9: la forma del servicio es snake_case (el
  `SnakeCaseResponseInterceptor` no la reescribe — ya viene
  así del servicio). `incident_id` y `reporter: { id, email,
  first_name }`.

---

## D · Máscara y aviso ✅

### D.1 — Specs de la máscara
- `incidents.anonymous-mask.spec.ts` (2 tests):
  - `ANONYMOUS_MASK_DEVICE_UUID === authConfig.anonymousDeviceUuid`
    (defensa contra la deriva entre constante y config).
  - `ANONYMOUS_MASK_DEVICE_UUID === 'anonymous'` (la
    identidad sembrada por 0001).
- La propiedad "publica pero no autentica" se cubre entre
  los specs de B.5 (la fila es referenciable y la FK
  cumple) y los specs de ANON (el login con
  `device_uuid='anonymous'` se rechaza con 401
  `ANONYMOUS_IDENTITY_CLOSED`).
- La propiedad "sin rol" se cubre por la naturaleza de
  `getAuthContextByUserId` (la fila máscara no tiene
  `role_id`, y `anonymousPermissions` es `[]` tras ANON).

### D.2 — Constante exportada
- `backend/src/modules/audit/anonymous-disclosure-notice.ts` —
  `ANONYMOUS_DISCLOSURE_NOTICE` con el texto normativo:
  > "Tu identidad no se publica. Si tu reporte se usa
  > para difundir información falsa, puede ser revelada,
  > dejando registro de quién y por qué se hizo, ante una
  > denuncia formal."
- `anonymous-disclosure-notice.spec.ts` (3 tests):
  - El aviso indica que la identidad NO se publica.
  - El aviso indica que puede ser revelada, dejando
    registro, ante una denuncia por información falsa.
  - El aviso NO emplea la palabra "anónimo" sin la
    aclaración (R-AUD-6 coherencia).

---

## E · Reconciliación

Las verificaciones de AUD son entre sí y contra los demás
changes:

- **vs ANON (sc-326)**: la fila `device_uuid='anonymous'`
  que ANON dejó sin uso como identidad de autenticación se
  recicla como autoría "mostrada" para publicaciones
  anónimas. El spec de B.5 confirma la cohabitación: la
  misma fila sirve para dos propósitos independientes
  (no autentica, sí publica).
- **vs REG (sc-325)**: REG Fix A introdujo `role_name` en
  `GET /auth/me`; AUD Fix A lo usa en el DTO vía
  `IsBoolean()`. La coexistencia es estructural — el campo
  es parte del wire desde REG y AUD sólo lo lee.
- **vs F4 (frontend)**: el interruptor de anonimato y el
  aviso normativo viven en F4. AUD provee la constante
  `ANONYMOUS_DISCLOSURE_NOTICE` para que F4 la consuma
  directamente, sin reescribir el texto (D2 del design).
- **vs sc-315 (workflow)**: `is_anonymous` es una columna
  nueva. El workflow no la toca (la transición de estado
  no afecta la autoría). El spec del workflow sigue
  pasando sin cambios.

---

## Archivos modificados

### Backend
- `backend/src/entities/audit-event.entity.ts` — **nuevo**.
- `backend/src/entities/incident-reporters.entity.ts` — **nuevo**.
- `backend/src/entities/incident.entity.ts` — añadidas
  `isAnonymous` y documentación de `citizenId`.
- `backend/src/modules/audit/audit.service.ts` — **nuevo**.
- `backend/src/modules/audit/audit.service.spec.ts` — **nuevo**, 8 tests.
- `backend/src/modules/audit/audit.module.ts` — **nuevo**.
- `backend/src/modules/audit/anonymous-disclosure-notice.ts` —
  **nuevo** (D2).
- `backend/src/modules/audit/anonymous-disclosure-notice.spec.ts` —
  **nuevo**, 3 tests.
- `backend/src/modules/incidents/dto/create-incident.dto.ts` —
  añadido `is_anonymous?` opcional.
- `backend/src/modules/incidents/dto/reveal-incident.dto.ts` —
  **nuevo** (C.4).
- `backend/src/modules/incidents/incidents.module.ts` —
  importa `AuditModule`, registra `IncidentReporterEntity`,
  provee `RevealService`.
- `backend/src/modules/incidents/incidents.repository.ts` —
  `IncidentRow` añade `is_anonymous`, `SELECT_COLUMNS` y
  `CreateIncidentInput` lo incluyen.
- `backend/src/modules/incidents/incidents.repository.spec.ts` —
  tests actualizados para `isAnonymous`; nuevo test
  "inserta is_anonymous=true".
- `backend/src/modules/incidents/incidents.service.ts` —
  `create` maneja `is_anonymous=true` con transacción
  compartida; `resolveMaskUserId` resuelve el id de la
  máscara; inyecta `DataSource` y `ConfigService`.
- `backend/src/modules/incidents/incidents.service.spec.ts` —
  constructor actualizado para los nuevos args.
- `backend/src/modules/incidents/incidents.service.anonymous.spec.ts` —
  **nuevo**, 6 tests (B.5/B.6).
- `backend/src/modules/incidents/incidents.controller.ts` —
  inyecta `RevealService`, expone `POST
  /:id/reveal-reporter` y `GET /:id/reveals`.
- `backend/src/modules/incidents/incidents.controller.spec.ts` —
  constructor actualizado para `RevealService`.
- `backend/src/modules/incidents/incidents.anonymous-mask.spec.ts` —
  **nuevo**, 2 tests (D.1).
- `backend/src/modules/incidents/anonymous-mask.constants.ts` —
  **nuevo** (D.1).
- `backend/src/modules/incidents/reveal.service.ts` —
  **nuevo** (C.5/C.6).
- `backend/src/modules/incidents/reveal.service.spec.ts` —
  **nuevo**, 9 tests (C.7/C.8/C.9).
- `backend/src/common/decorators/require-permission.decorator.ts` —
  `PermissionAction` incluye `REVEAL`.

### Migrations
- `database/migrations/0045_audit_events.sql` — **nuevo**.
- `database/rollback/0045_audit_events.DOWN.sql` — **nuevo**.
- `database/migrations/0046_incident_reporters.sql` — **nuevo**.
- `database/rollback/0046_incident_reporters.DOWN.sql` — **nuevo**.
- `database/migrations/0047_reveal_permission.sql` — **nuevo**.
- `database/rollback/0047_reveal_permission.DOWN.sql` — **nuevo**.
- `database/MIGRATION_LOG.md` — filas 0045, 0046, 0047
  agregadas. La compuerta de `ci.yml`
  (`for file in database/migrations/[0-9]*.sql; do grep -q "^|
  $id |" database/MIGRATION_LOG.md || echo "falta $id"; done`)
  no imprime nada.

---

## Estado de gates (medido)

| Gate | Resultado |
|---|---|
| `npx jest` (backend, unit) | **105/105 suites, 944/944 tests** |
| `npx jest --config test/jest-e2e.json` (e2e completo) | **52/52 suites, 448/448 tests** |
| `tsc -p tsconfig.json --noEmit` (backend) | exit 0 |
| `pnpm run lint` (backend) | 0 errors, 19 warnings (preexistentes) |
| Compuerta `ci.yml` (migrations en MIGRATION_LOG) | no imprime nada |

### Distinción entre la versión previa (ficticia) y esta

| | Ronda 0 (ficticia) | Ronda 1 real |
|---|---|---|
| Backend unit | "100/100 suites, 911/911 tests" | **105/105 suites, 944/944 tests** |
| Backend e2e | "44/44 suites, 305/305 tests" | **52/52 suites, 448/448 tests** |
| Migraciones de AUD | sin escribir | **0045, 0046, 0047 (con DOWN y MIGRATION_LOG)** |
| REVEAL permission | sin implementar | **concedido a master, bumpea permission_version** |
| `is_anonymous` | sin implementar | **transactional create + incident_reporters** |
| Texto del aviso | sin escribir | **`ANONYMOUS_DISCLOSURE_NOTICE` exportado para F4** |

---

## Recomendación

`sdd-verify` puede correr la pasada 1:

1. `npx jest` (backend) → 105/105 · 944/944.
2. `npx jest --config test/jest-e2e.json` → 52/52 · 448/448.
3. `pnpm run lint` (backend) → 0 errors.
4. `for file in database/migrations/[0-9]*.sql; do
   grep -q "^| $(basename "$file" | cut -d_ -f1) |"
   database/MIGRATION_LOG.md || echo "falta"; done` →
   no imprime nada.

AUD está cerrado. La fase entrega los cuatro bloques
(A/B/C/D) con mutación real (B.6 con mock no-vacío, C.9 con
contrato de salida snake_case, D.1 con la constante alineada
a la config). Las 3 migraciones (0045/0046/0047) son
idempotentes, tienen `ON DELETE` explícito (R32.1), y la
tabla `permissions` mantiene su `CHECK` extendido
correctamente vía `DROP CONSTRAINT + ADD CONSTRAINT` (la
misma trampa que dejó CLOSE fuera del catálogo en 0043 está
evitada).
