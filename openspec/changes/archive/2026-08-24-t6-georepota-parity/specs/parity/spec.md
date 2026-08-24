# Spec: T6 — GeoReporta Parity Gaps

**Change**: t6-georepota-parity  
**Version**: R1  
**Date**: 2026-08-23  

---

## T6.1 — Fix críticos de API

### S1 — Notifications unread count: path y response key

**Background**: GeoReporta frontend espera `GET /notifications/unread-count` → `{unread_count: N}`.  
NestJS actual: `GET /notifications/unread` → `{unread: N}`. Dos mismatches: path y key.

```
Scenario S1.1 — Ruta nueva retorna conteo correcto
  Given  un usuario autenticado con 3 notificaciones no leídas
  When   hace GET /api/notifications/unread-count
  Then   responde 200 con body { "unread_count": 3 }

Scenario S1.2 — Ruta vieja sigue funcionando (backward compat)
  Given  un usuario autenticado con 3 notificaciones no leídas
  When   hace GET /api/notifications/unread
  Then   responde 200 (cuerpo puede mantener key anterior o usar unread_count)

Scenario S1.3 — Sin token → 401
  Given  una request sin Authorization header
  When   hace GET /api/notifications/unread-count
  Then   responde 401
```

### S2 — Organizations notified-for: input location_id + category_id

**Background**: GeoReporta frontend manda `?location_id&category_id` del cascading dropdown del formulario de creación de incidente. NestJS acepta solo `?lat&lng`.

```
Scenario S2.1 — Input location_id + category_id resuelve zona y retorna orgs
  Given  una geo_zone con ID conocido que contiene coordenadas (-2.2, -80.5)
  And    una organización notificada para esa zona
  When   hace GET /api/organizations/notified-for?location_id={zone_id}&category_id={cat_id}
  Then   responde 200 con array de organizaciones que incluye la org de esa zona
  And    cada org incluye campo is_claimable (boolean)

Scenario S2.2 — Input lat+lng sigue funcionando
  Given  coordenadas (-2.2, -80.5) dentro de zona conocida
  When   hace GET /api/organizations/notified-for?lat=-2.2&lng=-80.5
  Then   responde 200 con array de organizaciones
  And    cada org incluye campo is_claimable

Scenario S2.3 — location_id no encontrado → array vacío
  Given  un location_id de UUID que no existe
  When   hace GET /api/organizations/notified-for?location_id={unknown_id}&category_id={cat_id}
  Then   responde 200 con array vacío []

Scenario S2.4 — Ningún input válido → 400
  Given  request sin lat/lng ni location_id
  When   hace GET /api/organizations/notified-for
  Then   responde 400
```

---

## T6.2 — Soft Deletes

### S3 — Incidents soft delete

```
Scenario S3.1 — DELETE escribe deleted_at, no elimina la fila
  Given  un incidente existente con id X
  And    el usuario tiene permiso DELETE incidents
  When   hace DELETE /api/incidents/X
  Then   responde 204
  And    la fila con id X sigue existiendo en la tabla incidents
  And    la fila tiene deleted_at IS NOT NULL

Scenario S3.2 — Incidente eliminado es invisible en GET /:id
  Given  un incidente con deleted_at seteado
  When   hace GET /api/incidents/{id}
  Then   responde 404

Scenario S3.3 — Incidente eliminado es invisible en GET /
  Given  3 incidentes, uno con deleted_at seteado
  When   hace GET /api/incidents
  Then   la respuesta incluye solo los 2 no eliminados

Scenario S3.4 — status_history del incidente sobrevive al soft-delete
  Given  un incidente con 2 filas de status_history vinculadas
  When   hace DELETE /api/incidents/{id}
  Then   204
  And    las 2 filas de status_history aún existen en DB

Scenario S3.5 — assignments del incidente sobreviven al soft-delete
  Given  un incidente con 1 assignment vinculado
  When   hace DELETE /api/incidents/{id}
  Then   204
  And    el assignment aún existe en DB

Scenario S3.6 — Sin permiso → 403
  Given  usuario sin DELETE incidents
  When   hace DELETE /api/incidents/{id}
  Then   403
```

### S4 — Assignments soft delete

```
Scenario S4.1 — release() escribe deleted_at, no elimina la fila
  Given  un assignment existente con id A
  And    usuario con permiso ASSIGN
  When   hace DELETE /api/assignments/A
  Then   204
  And    la fila A sigue en DB con deleted_at IS NOT NULL

Scenario S4.2 — Re-asignación tras release no viola UNIQUE constraint
  Given  incidente I con assignment al operador O que fue soft-deleted
  When   hace POST /api/assignments con {incident_id: I, operator_id: O}
  Then   201 (nuevo assignment creado)

Scenario S4.3 — Asignación activa duplicada sí viola constraint
  Given  incidente I con assignment activo al operador O (deleted_at IS NULL)
  When   intenta POST /api/assignments con {incident_id: I, operator_id: O}
  Then   409 Conflict
```

---

## T6.3 — Columnas de métricas

### S5 — incidents.claimed_at

```
Scenario S5.1 — claim() escribe claimed_at
  Given  un incidente en estado pending
  And    operador con permiso CLAIM incidents
  When   hace POST /api/incidents/{id}/claim
  Then   201
  And    la fila incidents tiene claimed_at IS NOT NULL (timestamp del momento del claim)

Scenario S5.2 — release() no borra claimed_at
  Given  un incidente reclamado (claimed_at seteado)
  When   hace POST /api/incidents/{id}/release
  Then   200 o 204
  And    la fila incidents tiene claimed_at IS NOT NULL (historial del último claim)

Scenario S5.3 — claimed_at aparece en la respuesta del incidente
  Given  un incidente reclamado
  When   hace GET /api/incidents/{id}
  Then   200 con claimed_at no null en el body
```

### S6 — incidents.resolution_date

```
Scenario S6.1 — updateStatus a 'resolved' escribe resolution_date
  Given  un incidente en estado in_progress
  When   actualiza su estado a resolved (PATCH status o flujo approve)
  Then   la fila incidents tiene resolution_date IS NOT NULL

Scenario S6.2 — reject flow borra resolution_date
  Given  un incidente en estado resolved con resolution_date seteado
  When   se ejecuta el flujo reject (admin rechaza la notificación pendiente)
  Then   la fila incidents tiene resolution_date IS NULL

Scenario S6.3 — resolution_date aparece en export CSV
  Given  un incidente con resolution_date seteado
  When   hace GET /api/incidents/export (formato CSV)
  Then   la columna resolution_date del CSV tiene el valor real, no updated_at

Scenario S6.4 — resolution_date en feed y stats
  Given  un incidente resolved
  When   hace GET /api/incidents/feed o GET /api/incidents/stats
  Then   resolution_date en la respuesta refleja la fecha real, no updated_at
```

---

## T6.4 — Assignment role-change

### S7 — PATCH /assignments/:id acepta campo role

```
Scenario S7.1 — PATCH con role válido actualiza assignment_role
  Given  un assignment con role = 'primary'
  And    usuario con permiso UPDATE assignments
  When   hace PATCH /api/assignments/{id} con body { "role": "supervisor" }
  Then   200
  And    la fila tiene role = 'supervisor'

Scenario S7.2 — PATCH con solo operator_id sigue funcionando (no regresión)
  Given  un assignment existente
  When   hace PATCH /api/assignments/{id} con { "operator_id": "{other_uuid}" }
  Then   200
  And    operatorId actualizado, role sin cambio

Scenario S7.3 — PATCH con role inválido → 400
  When   hace PATCH /api/assignments/{id} con { "role": "invalid_role" }
  Then   400

Scenario S7.4 — Sin permiso UPDATE assignments → 403
  When   usuario sin UPDATE assignments intenta PATCH /api/assignments/{id}
  Then   403
```

---

## T6.5 — Email OTP verification + columnas compliance

### S8 — terms_accepted_at se escribe en aceptar invitación

```
Scenario S8.1 — accept-invitation con terms_version escribe columnas
  Given  una invitación válida no expirada
  When   hace POST /api/auth/accept-invitation con { token, password, terms_version: "1.0" }
  Then   201 (usuario creado, tokens emitidos)
  And    la fila users tiene terms_accepted_at IS NOT NULL
  And    la fila users tiene terms_version = '1.0'

Scenario S8.2 — accept-invitation sin terms_version — campos quedan NULL
  Given  una invitación válida
  When   hace POST /api/auth/accept-invitation sin campo terms_version
  Then   201
  And    terms_accepted_at IS NULL, terms_version IS NULL
```

### S9 — Email OTP: verify-otp

```
Scenario S9.1 — OTP correcto verifica el email
  Given  un usuario con verification_otp '123456' y expiry en el futuro
  When   hace POST /api/email/verify-otp con { "otp": "123456" }
  Then   200
  And   la fila users tiene email_verified_at IS NOT NULL
  And   verification_otp IS NULL, verification_otp_expires_at IS NULL

Scenario S9.2 — OTP expirado → 422
  Given  un usuario con verification_otp '123456' y expiry en el pasado
  When   hace POST /api/email/verify-otp con { "otp": "123456" }
  Then   422 Unprocessable Entity

Scenario S9.3 — OTP incorrecto → 422
  Given  un usuario con verification_otp '123456'
  When   hace POST /api/email/verify-otp con { "otp": "000000" }
  Then   422

Scenario S9.4 — Usuario sin OTP pendiente → 422
  Given  un usuario sin verification_otp (ya verificado o nunca asignado)
  When   hace POST /api/email/verify-otp con { "otp": "123456" }
  Then   422

Scenario S9.5 — Sin autenticación → 401
  When   hace POST /api/email/verify-otp sin Authorization
  Then   401
```

### S10 — Email OTP: resend-verification

```
Scenario S10.1 — resend genera nuevo OTP y envía email
  Given  un usuario con email y email_verified_at IS NULL
  When   hace POST /api/email/resend-verification
  Then   202 Accepted
  And    la fila users tiene un nuevo verification_otp (distinto al anterior si existía)
  And    verification_otp_expires_at = NOW() + 15 minutos
  And   un mensaje al mail outbox (Redis Stream mail:outbox) con destino email del usuario

Scenario S10.2 — Rate limit: segunda llamada en < 60s → 429
  Given  usuario que acaba de hacer resend hace < 60 segundos
  When   hace POST /api/email/resend-verification de nuevo
  Then   429 Too Many Requests

Scenario S10.3 — Usuario ya verificado → 422
  Given  un usuario con email_verified_at IS NOT NULL
  When   hace POST /api/email/resend-verification
  Then   422
```

---

## T6.6 — Incident image upload

### S11 — POST /incidents/:id/images

```
Scenario S11.1 — Upload 2 imágenes JPEG → 201, 2 filas en DB
  Given  un incidente existente del que el usuario es propietario
  When   hace POST /api/incidents/{id}/images con 2 archivos JPEG (multipart)
  Then   201 con array de 2 objetos { id, url }
  And    2 filas en incident_images con comment_id = id

Scenario S11.2 — MIME type inválido → 422
  Given  un incidente existente
  When   hace POST /api/incidents/{id}/images con un archivo PDF
  Then   422

Scenario S11.3 — Más de 5 archivos → 400 o 422
  When   hace POST con 6 archivos JPEG
  Then   400 o 422

Scenario S11.4 — Non-owner sin permiso CREATE incident-images → 403
  Given  incidente de otro usuario
  And   requester no tiene 'CREATE incident-images'
  When   hace POST /api/incidents/{id}/images
  Then   403

Scenario S11.5 — Sin autenticación → 401
  When   hace POST /api/incidents/{id}/images sin token
  Then   401

Scenario S11.6 — Incidente no existe → 404
  When   hace POST /api/incidents/{uuid-inexistente}/images
  Then   404
```

### S12 — DELETE /incidents/:id/images/:imageId

```
Scenario S12.1 — Owner puede eliminar su imagen → 204
  Given  imagen subida por el owner del incidente
  When   hace DELETE /api/incidents/{id}/images/{imageId}
  Then   204
  And    fila en incident_images eliminada

Scenario S12.2 — S3 fallo → igual 204, fila DB eliminada, warning en log
  Given  storage stub que lanza error
  When   hace DELETE /api/incidents/{id}/images/{imageId}
  Then   204
  And    fila en DB eliminada (S3 failure no bloquea)

Scenario S12.3 — imageId no pertenece al incident_id → 404
  When   DELETE con imageId de otro incidente
  Then   404

Scenario S12.4 — Non-owner sin permiso DELETE incident-images → 403
  When   usuario que no es owner y sin permiso DELETE incident-images
  Then   403
```

---

## T6.7 — Export XLSX + Feed Recovery + SSE tombstone

### S13 — Export XLSX

```
Scenario S13.1 — format=xlsx retorna archivo Excel
  Given  usuario con permiso EXPORT incidents
  When   hace GET /api/incidents/export?format=xlsx
  Then   200 con Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
  And   Content-Disposition: attachment; filename="incidencias-{timestamp}.xlsx"
  And   cuerpo es un buffer binario válido de Excel (magic bytes 50 4B 03 04)

Scenario S13.2 — format=csv (default) sigue funcionando
  When   hace GET /api/incidents/export o /api/incidents/export?format=csv
  Then   200 con Content-Type: text/csv

Scenario S13.3 — Alias /exportar funciona igual que /export
  When   hace GET /api/incidents/exportar?format=xlsx
  Then   mismo resultado que S13.1
```

### S14 — Feed rebuild

```
Scenario S14.1 — POST /admin/feed/rebuild repuebla el feed Redis
  Given  un usuario con permiso ADMIN feed (admin_sistema)
  And   Redis feed key vacío (simulado)
  When   hace POST /api/admin/feed/rebuild
  Then   202 Accepted
  And   Redis contiene las entradas del feed reconstruidas desde Postgres

Scenario S14.2 — Sin permiso ADMIN feed → 403
  Given  usuario sin permiso ADMIN feed
  When   hace POST /api/admin/feed/rebuild
  Then   403
```

### S15 — SSE tombstone

```
Scenario S15.1 — GET /notifications/stream → 410 Gone
  When   hace GET /api/notifications/stream
  Then   410 Gone
  And   body incluye {"message": "This endpoint has been replaced by Socket.IO realtime events"}
```

---

## T6.8 — Path aliases + GDPR

### S16 — Path aliases

```
Scenario S16.1 — GET /menus/my retorna lo mismo que GET /menus
  Given  usuario autenticado con menús configurados
  When   hace GET /api/menus/my
  Then   200 con misma respuesta que GET /api/menus

Scenario S16.2 — POST /invitations/accept acepta y redirige a POST /auth/accept-invitation
  Given  una invitación válida
  When   hace POST /api/invitations/accept con { token, password }
  Then   201 con tokens (mismo comportamiento que /auth/accept-invitation)

Scenario S16.3 — GET /estados retorna catálogo de transiciones
  When   hace GET /api/estados
  Then   200 con misma respuesta que GET /api/incidents/statuses

Scenario S16.4 — GET /invitations/{token}/preview retorna datos de la invitación
  Given  un token válido de invitación
  When   hace GET /api/invitations/{token}/preview (path param)
  Then   200 con datos de la invitación (mismos que /api/invitations/preview?token=)
```

### S17 — UserAnonymizer GDPR

```
Scenario S17.1 — DELETE /users/:id anonimiza PII + soft-delete
  Given  usuario con first_name, email, avatar_url no nulos
  And   requester con permiso DELETE users
  When   hace DELETE /api/users/{id}
  Then   204
  And   la fila users tiene deleted_at IS NOT NULL
  And   first_name = 'Usuario eliminado', last_name IS NULL
  And   email = 'deleted+{id}@tase.invalid'
  And   avatar_url IS NULL, password_hash IS NULL
  And   device_uuid IS NULL (o valor nulo)

Scenario S17.2 — Usuario eliminado no puede autenticarse
  Given  usuario cuya fila fue anonimizada (deleted_at set)
  When   intenta POST /api/auth/login con las credenciales originales
  Then   401

Scenario S17.3 — GET /users/:id de usuario eliminado → 404
  When   hace GET /api/users/{id} de un usuario con deleted_at seteado
  Then   404

Scenario S17.4 — Sin permiso DELETE users → 403
  When   usuario sin DELETE users intenta DELETE /api/users/{id}
  Then   403
```

### S18 — POST /register tombstone

```
Scenario S18.1 — POST /register → 410 Gone
  When   hace POST /api/register con cualquier body
  Then   410 Gone
  And   body incluye {"message": "Registration is invitation-only. Contact an administrator."}
```
