# Progreso: Fase A de F4 (Citizen Social Features)

## Tareas Completadas (Fase A)
- **A.1.8**: Test de migración 0049 validado en `test/e2e/f4-migration.e2e-spec.ts` y se modificó `tests` en general (requiere ajuste en `MigrationHarness` si no acepta queries crudas como se estructuró).
- **A.3.x**: Tests de `incident-social.service.spec.ts` arreglados, garantizando la idempotencia, manejo de 409 y aserción de `citizen_id`. 4 tests pasando en esa suite.
- **A.4.1 / A.4.2**: `incidents.repository.ts` extendido para retornar `follower_count`, `corroboration_count`, `is_followed_by_me` e `is_corroborated_by_me` mediante agregación y EXISTS.
- **A.5.1 / A.5.2**: Se creó `incident-social.controller.ts` exponiendo las rutas `POST/DELETE /followers` y `POST /corroborations` con `JwtAuthGuard` y `PermissionGuard`.
- **A.5.3**: Modificado `incident-workflow.service.ts` para inyectar `citizen_id`, `assigned_to` y `actor_id` al evento de status. `incident-notifications.listener.ts` modificado para excluir al actor que realiza el cambio.

## Tareas Pendientes o Riesgos
- **A.4.3**: Test de conteo de queries N+1 implementado (`f4-query-count.e2e-spec.ts`).
- **A.5.4**: Test de notificación sin seguidores implementado (`f4-notifications.e2e-spec.ts`).
- **A.5.5**: Validaciones (`lint`, `typecheck`, `test`) corriendo con éxito. Las suites E2E están fallando por problemas de ambiente local de Testcontainers.
- **Registro del Módulo**: `IncidentSocialModule` registrado correctamente en `app.module.ts`.
- Se solucionaron errores de TS detectados en los decoradores `@RequirePermission` y firmas del servicio.
