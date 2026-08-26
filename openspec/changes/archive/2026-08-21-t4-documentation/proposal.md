# Proposal: T4.4 Documentación — Swagger + Runbook

**Change**: t4-documentation  
**Author**: Claude (Architect role — Gemini CLI no disponible en esta sesión)  
**Date**: 2026-08-21  
**Depende de**: T4.3 completada (helmet en main.ts ya aplicado)  

---

## Intent

Dos gaps de documentación operativa identificados como cierre de Fase 4:

1. **T4.4a — Swagger / OpenAPI** (severidad: MEDIA)  
   El backend tiene 40+ endpoints distribuidos en 15 módulos sin documentación
   interactiva. Developers y QA necesitan explorar la API sin leer código fuente.
   Setup mínimo funcional en `main.ts` — sin decoradores `@ApiProperty` en masa
   (eso es deuda cosmética incremental, no bloqueante).

2. **T4.4b — Runbook de Despliegue** (severidad: MEDIA)  
   No existe documentación de cómo desplegar el backend a producción. El proceso
   manual de migraciones (CC3) y la lista completa de env vars no están en ningún
   lugar accesible fuera del código fuente. Un deploy sin runbook depende de
   conocimiento implícito del dev que lo hizo antes.

---

## Scope

| Archivo | Cambio |
|---------|--------|
| `backend/package.json` + `pnpm-lock.yaml` | `pnpm add @nestjs/swagger swagger-ui-express` |
| `backend/src/main.ts` | Setup Swagger guarded by `NODE_ENV !== 'production'` |
| `docs/runbooks/deploy.md` | Runbook completo: env vars, pasos, rollback, smoke tests |

**Fuera de scope**:
- `@ApiProperty()` / `@ApiOperation()` en DTOs — se hace incrementalmente por módulo
- `@ApiTags()` en controllers — ídem
- k6 load tests (T4.2 — change separado)
- Frontend deployment

---

## Orden de implementación

1. **T4.4a** primero — setup de código, verificable con `pnpm run build`
2. **T4.4b** segundo — documento puro, sin cambios de código
