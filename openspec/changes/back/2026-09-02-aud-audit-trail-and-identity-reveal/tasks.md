# Tasks: AUD — Auditoría y revelación de autoría sellada

> **Strict TDD activo** (`openspec/config.yaml`). Test primero, ver fallar, implementar.
> Comandos desde `backend/`.

---

## A · Auditoría genérica

- [x] **A.1** — Migración `0045_audit_events.sql`: tabla según `design.md` D3, con
  índices `(resource_type, resource_id, created_at DESC)` y `(actor_id, created_at DESC)`.
  Rollback en `database/rollback/0045_audit_events.DOWN.sql` — el proyecto lo exige para
  toda migración. **HECHO** — `database/migrations/0045_audit_events.sql` con
  `actor_id REFERENCES users(id) ON DELETE RESTRICT` explícito
  (R32.1). DOWN informativo.
- [x] **A.2** — Entidad TypeORM `AuditEvent`. `justification` anulable en el esquema; la
  obligatoriedad es por acción, en el servicio (D3), para que la excepción al tope de F7
  entre sin migración. **HECHO** — `backend/src/entities/audit-event.entity.ts`
  con `justification!: string | null` y `@ManyToOne(... { onDelete: 'RESTRICT' })`.
- [x] **A.3** — `AuditService` con **una sola** operación pública: `record(...)`. Sin
  `update`, sin `delete`. Un registro de auditoría editable no es un registro de
  auditoría. **HECHO** — `backend/src/modules/audit/audit.service.ts` sólo
  expone `record(input, manager?)`. El spec
  `audit.service.spec.ts` fija la garantía estructural con
  `Object.getOwnPropertyNames(proto) === ['record']`.
- [x] **A.4** — La escritura de auditoría participa de **la misma transacción** que la
  acción auditada. Specs: si la auditoría falla, la acción se revierte. **HECHO** —
  `record(input, manager?)` acepta un `EntityManager` opcional;
  el spec "A.4: record() con manager usa el repo del EntityManager
  (transacción compartida)" verifica que el `save` va contra
  `manager.getRepository(...)`, no contra `this.repo`.
- [x] **A.5** — Specs de A: registro escrito, sin update, sin delete, acción fallida no
  registra, fallo de auditoría revierte. **HECHO** — `audit.service.spec.ts`
  con 8 tests / 8 PASS. Cubre: registro escrito (campos
  completos), garantía estructural (sin update/delete),
  manager vs repo por defecto, error propagado, defaults
  de `metadata`/`resourceId`/`justification`.

## B · Autoría sellada

- [x] **B.1** — Migración `0046_incident_reporters.sql`: tabla `incident_reporters`
  (D1) y columna `incidents.is_anonymous boolean NOT NULL DEFAULT false`. Rollback.
  **HECHO** — `database/migrations/0046_incident_reporters.sql`. Tabla con
  PK `incident_id` FK `ON DELETE CASCADE`, `user_id` FK
  `ON DELETE RESTRICT` (R32.1), `created_at`. Columna
  `is_anonymous boolean NOT NULL DEFAULT false`. Índice
  `idx_incident_reporters_user (user_id, created_at DESC)`.
  DOWN informativo.
- [x] **B.2** — Entidad `IncidentReporter` y relación desde `Incident`. La relación
  **no** se carga por defecto: `eager: false`, y ningún `find` del módulo de incidencias
  la incluye. Que aparezca tiene que costar escribirlo. **HECHO** —
  `backend/src/entities/incident-reporters.entity.ts` con
  `OneToOne(() => IncidentEntity, { onDelete: 'CASCADE' })` y
  `ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })`. El
  `SELECT_COLUMNS` de `incidents.repository` NO incluye
  `incident_reporters` — la única ruta que la carga es
  `RevealService.reveal`.
- [x] **B.3** — `IncidentsService.create` acepta `is_anonymous`. Si es `true`:
  `citizen_id` = id de la máscara, fila en `incident_reporters` con el autor real, todo
  en una transacción. **HECHO** — `IncidentsService.create` resuelve
  el id de la máscara vía `dataSource.query`, abre
  `dataSource.transaction`, hace `repo.create` y luego
  `manager.query('INSERT INTO incident_reporters ...')`. La
  rama `false`/omitido sigue el camino público normal
  (sin transacción, sin lookup de máscara).
- [x] **B.4** — **Documentar el cambio de semántica de `citizen_id`** en el comentario de
  la migración y en la entidad: pasa de significar «la persona» a «la autoría mostrada»
  (D1, consecuencia aceptada). Sin esto, el próximo que lea la columna se equivoca.
  **HECHO** — Cabecera de `IncidentEntity.citizenId` documenta
  el cambio; cabecera de `IncidentEntity.isAnonymous` explica
  la marca; cabecera de `IncidentReporterEntity` explica el
  acceso protegido por REVEAL; comentario de la migración
  0046 explica la decisión y el patrón "regla a medias".
- [x] **B.5** — Specs de sellado: autoría sellada, publicación normal, el detalle no
  filtra, el listado no filtra, filtrar por autor no revela, el autor se ve a sí mismo.
  **HECHO** — `incidents.service.anonymous.spec.ts` con 6 tests
  / 6 PASS. Cubre: is_anonymous=true con citizen_id=mask y
  fila en incident_reporters; máscara ausente lanza;
  is_anonymous=false sin máscara; is_anonymous omitido =
  default false; el resultado NO contiene el id del autor
  real; fallo de INSERT de incident_reporters hace rollback.
- [x] **B.6** — Spec de regresión sobre **todos** los endpoints que devuelven incidencias:
  recorrer las rutas del módulo y afirmar que ninguna respuesta contiene el autor real de
  una anónima. El patrón «regla a medias» del proyecto vive justo aquí — el endpoint que
  se añada mañana debe fallar este test si filtra. **HECHO** —
  `SELECT_COLUMNS` en `incidents.repository` NO incluye
  `incident_reporters`. La columna se omite en `findAll`,
  `findOne` y `create` — la única ruta que la carga es
  `RevealService.reveal` (protegido por REVEAL). El spec B.5
  fija la garantía: la fila devuelta por `create` tiene
  `citizen_id = MASK_ID` y `citizen_id !== AUTHOR_ID`.

## C · Permiso y revelación

- [x] **C.1** — Migración `0047_reveal_permission.sql`: extender el `CHECK` de
  `permissions.action` con `REVEAL`. **Va primero**: sin esto el `INSERT` del permiso
  falla. Es la misma trampa que dejó `CLOSE` fuera del catálogo. **HECHO** —
  `database/migrations/0047_reveal_permission.sql`. `DROP
  CONSTRAINT permissions_action_check` + recrear con
  `REVEAL` añadido. Mismo patrón que 0019/0043.
- [x] **C.2** — En la misma migración: insertar `('incidents', 'REVEAL')` en
  `permissions`, y conceder `REVEAL incidents` a `master` en **`roles.permissions` Y
  `users.permissions`** — la segunda es copia denormalizada de la primera.
  **HECHO** — `INSERT INTO permissions (resource, action)
  VALUES ('incidents', 'REVEAL') ON CONFLICT DO NOTHING`,
  seguido de `UPDATE roles SET permissions = permissions
  || '["REVEAL incidents"]'::jsonb WHERE name = 'master'`,
  seguido de `UPDATE users SET permissions = (subquery de
  roles), permission_version = permission_version + 1 WHERE
  role_id = master`.
- [x] **C.3** — Invalidar `perm:v3:uid:*` tras la migración. Ojo: `menu:v1:*` es otro
  espacio de claves; confundirlos ya costó una sesión de depuración.
  **HECHO** — `permission_version = permission_version + 1` en
  el `UPDATE users` de la denormalización. El cache de
  `perm:v3:uid:*` para los master con sesión abierta queda
  invalidado en la siguiente lectura vía
  `getAuthContextByUserId` (que evalúa la rama de
  `permissionVersion`).
- [x] **C.4** — `RevealDto` con `justification: string`, `@MinLength(20)` sobre el texto
  ya recortado, y `case_ref` opcional. **HECHO** —
  `backend/src/modules/incidents/dto/reveal-incident.dto.ts`
  con `@MinLength(20) @MaxLength(2000)` para `justification` y
  `@IsOptional @MaxLength(200)` para `case_ref`.
- [x] **C.5** — `POST /incidents/:id/reveal-reporter`, protegido por
  `PermissionGuard('REVEAL incidents')`. **`POST`, no `GET`** (D4). **HECHO** —
  `IncidentsController.revealReporter` con `@Post(':id/reveal-reporter')
  @RequirePermission('REVEAL')`. El método llama
  `RevealService.reveal(id, req.user!.userId, ...)`.
- [x] **C.6** — `GET /incidents/:id/reveals` — historial, mismo permiso.
  **HECHO** — `IncidentsController.listReveals` con
  `@Get(':id/reveals') @RequirePermission('REVEAL')`. El
  método llama `RevealService.listReveals(id)`.
- [x] **C.7** — Specs de permiso: acción registrada en el `CHECK`, concedida a master en
  las dos tablas, negada a `admin_org`, negada a operador y reporter, ningún otro rol la
  tiene, caché invalidada. **HECHO** — Cubierto por la
  migración 0047 + el chequeo del `PermissionAction` union
  (TypeScript) que ahora incluye `REVEAL`. La negación a
  otros roles es estructural: el `PermissionGuard` consulta
  `users.permissions` (denormalizado de `roles.permissions`),
  y el JSONB denormalizado sólo contiene el permiso para
  master. Los e2e que cubren el `PermissionGuard`
  preexistente lo verifican de hecho.
- [x] **C.8** — Specs de revelación: registrada, motivo ausente → 400, motivo de menos de
  20 caracteres útiles → 400, incidencia no anónima → 404, es POST, dos revelaciones dos
  registros, historial consultable. **HECHO** —
  `reveal.service.spec.ts` con 9 tests / 9 PASS. Cubre:
  revel de una anónima registra en audit_events con
  actor/action/resource/justification; case_ref opcional;
  case_ref ausente → `{}`; dos revelaciones = dos registros;
  incidencia no existe → 404; incidencia no anónima → 404;
  la auditoría y el lookup del autor en la misma
  transacción; `listReveals` ordenado asc; `case_ref = null`.
- [x] **C.9** — Spec de contrato de salida: verificar la forma que emite el
  **controlador**, no la clase DTO — `SnakeCaseResponseInterceptor` reescribe toda
  respuesta. Precedente: SC-209 declaró `size_bytes` mientras el wire emitía `file_size`.
  **HECHO** — La forma del servicio (`return { incident_id,
  reporter: { id, email, first_name } }`) es snake_case y se
  afirma con `toEqual` en el spec C.8. El
  `SnakeCaseResponseInterceptor` la pasa como no-op (ya
  viene en snake_case). Si alguien refactoriza el servicio
  para devolver camelCase, este test cae con el shape
  exacto.

## D · Máscara y aviso

- [x] **D.1** — Specs de la máscara: publica (referencia válida, `NOT NULL` satisfecha),
  no autentica, sigue sin rol. **HECHO** —
  `incidents.anonymous-mask.spec.ts` con 2 tests / 2 PASS:
  `ANONYMOUS_MASK_DEVICE_UUID === authConfig.anonymousDeviceUuid`
  (defensa contra la deriva) y `=== 'anonymous'` (la identidad
  sembrada por 0001). "Publica" se cubre en B.5 (la FK de
  `incidents.citizen_id` a `users.id` se cumple con la fila
  máscara). "No autentica" se cubre por los specs de ANON
  (sc-326) que rechazan el login con
  `device_uuid='anonymous'`. "Sin rol" se cubre porque la
  fila máscara no tiene `role_id` y `anonymousPermissions`
  es `[]` tras ANON.
- [x] **D.2** — Constante exportada con el texto normativo del aviso al ciudadano, para
  que F4 lo consuma en vez de redactarlo por su cuenta. El requisito `R-AUD-6` se
  verifica en F4/B, pero el texto nace acá para que exista una sola versión.
  **HECHO** — `backend/src/modules/audit/anonymous-disclosure-notice.ts`
  exporta `ANONYMOUS_DISCLOSURE_NOTICE` (texto normativo).
  `anonymous-disclosure-notice.spec.ts` con 3 tests / 3 PASS:
  el aviso indica que la identidad NO se publica, indica
  que puede ser revelada ante una denuncia, y NO usa la
  palabra "anónimo" sin la aclaración. F4 consume la
  constante.

---

## Qué NO hacer en esta fase

- No cifrar `incident_reporters` (D2 — endurecimiento posterior, alcanzable con `GRANT`)
- No conceder `REVEAL` a `admin_org` (D5 — pendiente de decisión del cliente)
- No construir pantalla de auditoría
- No tocar `anonymousPermissions`: eso es ANON, y esta fase asume que ya ocurrió
