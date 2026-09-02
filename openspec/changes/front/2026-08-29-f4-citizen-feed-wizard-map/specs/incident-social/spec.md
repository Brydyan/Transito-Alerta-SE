# Spec: F4 Fase A — Seguimiento y corroboración

## Domain: incident-social (NEW — backend, prerequisito de la Fase B)

### Requirement: Seguir una incidencia
Un usuario autenticado DEBE poder seguir una incidencia y dejar de seguirla. Seguir
DEBE ser idempotente.

- Scenario: Seguir por primera vez — GIVEN un usuario autenticado y una incidencia que
  no sigue WHEN envía `POST /api/incidents/:id/followers` THEN se crea el seguimiento
  y la respuesta incluye el conteo actualizado
- Scenario: Seguir dos veces — GIVEN un usuario que ya sigue la incidencia WHEN repite
  la petición THEN la respuesta es exitosa, el conteo no cambia y no se crea una
  segunda fila (`UNIQUE (incident_id, user_id)`)
- Scenario: Dejar de seguir — GIVEN un seguimiento existente WHEN envía
  `DELETE /api/incidents/:id/followers` THEN se elimina y el conteo decrece
- Scenario: Dejar de seguir algo no seguido — WHEN no existe el seguimiento THEN la
  respuesta es exitosa y el conteo no cambia; no se devuelve 404
- Scenario: Incidencia inexistente — GIVEN un id que no existe THEN se responde 404
- Scenario: Sin autenticar — GIVEN una petición sin sesión válida THEN se responde 401

### Requirement: Corroborar una incidencia
Un usuario DEBE poder corroborar una incidencia («yo también reporto»), una sola vez,
con un comentario opcional.

- Scenario: Corroborar — GIVEN un usuario que no ha corroborado WHEN envía
  `POST /api/incidents/:id/corroborations` THEN se registra y el conteo aumenta
- Scenario: Corroborar con comentario — GIVEN un comentario opcional en el cuerpo
  THEN se persiste junto a la corroboración
- Scenario: Corroborar dos veces — GIVEN un usuario que ya corroboró WHEN repite la
  petición THEN se responde 409 y el conteo no cambia
- Scenario: Autor de la incidencia — GIVEN el autor de la incidencia WHEN intenta
  corroborar su propio reporte THEN se responde 409: crear el reporte ya es su testimonio
- Scenario: Corroboración no se deshace — GIVEN una corroboración existente THEN no
  se expone endpoint de borrado; es un testimonio, no una preferencia

### Requirement: Conteos agregados en incidencias
El listado y el detalle de incidencias DEBEN exponer los conteos y el estado del
usuario actual.

- Scenario: Campos presentes — GIVEN cualquier respuesta de incidencia THEN incluye
  `follower_count`, `corroboration_count`, `is_followed_by_me` e `is_corroborated_by_me`
- Scenario: Sin interacciones — GIVEN una incidencia sin seguidores ni corroboraciones
  THEN ambos conteos son `0` y ambas banderas `false`
- Scenario: Sin N+1 — GIVEN un listado paginado de incidencias THEN los conteos se
  resuelven con agregación en la consulta, no con una consulta por fila

### Requirement: Notificación a seguidores
Al cambiar el estado de una incidencia, sus seguidores DEBEN ser notificados.

- Scenario: Cambio de estado — GIVEN una incidencia con seguidores WHEN su estado
  cambia THEN se genera una notificación para cada seguidor
- Scenario: Sin autonotificación — GIVEN que quien provoca el cambio también sigue la
  incidencia THEN no recibe notificación de su propia acción
- Scenario: Sin seguidores — GIVEN una incidencia sin seguidores THEN el cambio de
  estado no genera notificaciones y no falla

### Requirement: Permisos propagados al modelo denormalizado
Los permisos nuevos DEBEN quedar disponibles para los usuarios existentes, no sólo
para los roles.

- Scenario: Rol actualizado — GIVEN la migración aplicada THEN `roles.permissions`
  contiene los permisos nuevos en los cuatro roles
- Scenario: Usuarios existentes actualizados — GIVEN usuarios creados antes de la
  migración THEN su `users.permissions` también contiene los permisos nuevos
- Scenario: Caché invalidada — GIVEN el despliegue completado THEN las claves
  `perm:v3:uid:*` se invalidan, de modo que la resolución de permisos no sirve la
  copia anterior

## Coverage

Happy paths: cubiertos (seguir, dejar de seguir, corroborar, conteos, notificar).
Edge cases: cubiertos (idempotencia, doble corroboración, autor corroborando,
incidencia sin seguidores, dejar de seguir lo no seguido).
Error states: cubiertos (404, 401, 409).
Rendimiento: exigido explícitamente que no haya N+1 en el listado.

## Next

Fase A debe estar integrada antes de comenzar la Fase B. Ver
`specs/frontend-citizen/spec.md`.
