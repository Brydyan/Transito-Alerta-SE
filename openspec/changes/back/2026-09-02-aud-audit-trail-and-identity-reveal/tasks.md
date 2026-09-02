# Tasks: AUD — Auditoría y revelación de autoría sellada

> **Strict TDD activo** (`openspec/config.yaml`). Test primero, ver fallar, implementar.
> Comandos desde `backend/`.

---

## A · Auditoría genérica

- [ ] **A.1** — Migración `0043_audit_events.sql`: tabla según `design.md` D3, con
  índices `(resource_type, resource_id, created_at DESC)` y `(actor_id, created_at DESC)`.
  Rollback en `database/rollback/0043_audit_events.DOWN.sql` — el proyecto lo exige para
  toda migración.
- [ ] **A.2** — Entidad TypeORM `AuditEvent`. `justification` anulable en el esquema; la
  obligatoriedad es por acción, en el servicio (D3), para que la excepción al tope de F7
  entre sin migración.
- [ ] **A.3** — `AuditService` con **una sola** operación pública: `record(...)`. Sin
  `update`, sin `delete`. Un registro de auditoría editable no es un registro de
  auditoría.
- [ ] **A.4** — La escritura de auditoría participa de **la misma transacción** que la
  acción auditada. Specs: si la auditoría falla, la acción se revierte.
- [ ] **A.5** — Specs de A: registro escrito, sin update, sin delete, acción fallida no
  registra, fallo de auditoría revierte.

## B · Autoría sellada

- [ ] **B.1** — Migración `0044_incident_reporters.sql`: tabla `incident_reporters`
  (D1) y columna `incidents.is_anonymous boolean NOT NULL DEFAULT false`. Rollback.
- [ ] **B.2** — Entidad `IncidentReporter` y relación desde `Incident`. La relación
  **no** se carga por defecto: `eager: false`, y ningún `find` del módulo de incidencias
  la incluye. Que aparezca tiene que costar escribirlo.
- [ ] **B.3** — `IncidentsService.create` acepta `is_anonymous`. Si es `true`:
  `citizen_id` = id de la máscara, fila en `incident_reporters` con el autor real, todo
  en una transacción.
- [ ] **B.4** — **Documentar el cambio de semántica de `citizen_id`** en el comentario de
  la migración y en la entidad: pasa de significar «la persona» a «la autoría mostrada»
  (D1, consecuencia aceptada). Sin esto, el próximo que lea la columna se equivoca.
- [ ] **B.5** — Specs de sellado: autoría sellada, publicación normal, el detalle no
  filtra, el listado no filtra, filtrar por autor no revela, el autor se ve a sí mismo.
- [ ] **B.6** — Spec de regresión sobre **todos** los endpoints que devuelven incidencias:
  recorrer las rutas del módulo y afirmar que ninguna respuesta contiene el autor real de
  una anónima. El patrón «regla a medias» del proyecto vive justo aquí — el endpoint que
  se añada mañana debe fallar este test si filtra.

## C · Permiso y revelación

- [ ] **C.1** — Migración `0045_reveal_permission.sql`: extender el `CHECK` de
  `permissions.action` con `REVEAL`. **Va primero**: sin esto el `INSERT` del permiso
  falla. Es la misma trampa que dejó `CLOSE` fuera del catálogo.
- [ ] **C.2** — En la misma migración: insertar `('incidents', 'REVEAL')` en
  `permissions`, y conceder `REVEAL incidents` a `master` en **`roles.permissions` Y
  `users.permissions`** — la segunda es copia denormalizada de la primera.
- [ ] **C.3** — Invalidar `perm:v3:uid:*` tras la migración. Ojo: `menu:v1:*` es otro
  espacio de claves; confundirlos ya costó una sesión de depuración.
- [ ] **C.4** — `RevealDto` con `justification: string`, `@MinLength(20)` sobre el texto
  ya recortado, y `case_ref` opcional.
- [ ] **C.5** — `POST /incidents/:id/reveal-reporter`, protegido por
  `PermissionGuard('REVEAL incidents')`. **`POST`, no `GET`** (D4).
- [ ] **C.6** — `GET /incidents/:id/reveals` — historial, mismo permiso.
- [ ] **C.7** — Specs de permiso: acción registrada en el `CHECK`, concedida a master en
  las dos tablas, negada a `admin_org`, negada a operador y reporter, ningún otro rol la
  tiene, caché invalidada.
- [ ] **C.8** — Specs de revelación: registrada, motivo ausente → 400, motivo de menos de
  20 caracteres útiles → 400, incidencia no anónima → 404, es POST, dos revelaciones dos
  registros, historial consultable.
- [ ] **C.9** — Spec de contrato de salida: verificar la forma que emite el
  **controlador**, no la clase DTO — `SnakeCaseResponseInterceptor` reescribe toda
  respuesta. Precedente: SC-209 declaró `size_bytes` mientras el wire emitía `file_size`.

## D · Máscara y aviso

- [ ] **D.1** — Specs de la máscara: publica (referencia válida, `NOT NULL` satisfecha),
  no autentica, sigue sin rol.
- [ ] **D.2** — Constante exportada con el texto normativo del aviso al ciudadano, para
  que F4 lo consuma en vez de redactarlo por su cuenta. El requisito `R-AUD-6` se
  verifica en F4/B, pero el texto nace acá para que exista una sola versión.

---

## Qué NO hacer en esta fase

- No cifrar `incident_reporters` (D2 — endurecimiento posterior, alcanzable con `GRANT`)
- No conceder `REVEAL` a `admin_org` (D5 — pendiente de decisión del cliente)
- No construir pantalla de auditoría
- No tocar `anonymousPermissions`: eso es ANON, y esta fase asume que ya ocurrió
