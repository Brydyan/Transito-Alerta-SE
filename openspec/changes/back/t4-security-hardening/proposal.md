# Proposal: T4 Security Hardening

**Change**: t4-security-hardening  
**Author**: Claude (Architect role)  
**Date**: 2026-08-21  
**Priority**: Alta — 2 bugs funcionales + 1 gap de seguridad de headers  

---

## Intent

Tres gaps de seguridad identificados en auditoría post-Fase 3:

1. **T4.3c — Bug de dedup en NotificationsService** (severidad: ALTA)  
   La línea `created_at: (() => sixtySecondsAgo)() as any` en `notifications.service.ts:40`
   pasa un `Date` plano donde TypeORM espera un `FindOperator`. Resultado: la cláusula
   genera `WHERE created_at = '...'` (igualdad exacta) en lugar de `WHERE created_at > '...'`,
   así que la dedup **nunca funciona** y se crean notificaciones duplicadas ilimitadas.

2. **T4.3a — Helmet ausente en main.ts** (severidad: MEDIA)  
   El servidor no envía headers de seguridad HTTP estándar (X-Frame-Options,
   X-Content-Type-Options, Strict-Transport-Security, etc.). Cualquier cliente recibe
   respuestas sin protección contra clickjacking, MIME sniffing y downgrade HTTPS.

3. **T4.3b — Tests de inyección SQL y XSS** (severidad: MEDIA)  
   Los repositories ya usan queries parametrizadas (`$1, $2, ...`) y ValidationPipe
   (`whitelist: true`) rechaza campos extra, pero no existe ningún test E2E que
   verifique que un intento de inyección recibe 400 (no 500 y no ejecución SQL).

---

## Scope

| Archivo | Cambio |
|---------|--------|
| `backend/src/modules/notifications/notifications.service.ts` | Reemplazar `as any` con `MoreThan()` de TypeORM |
| `backend/src/main.ts` | `import helmet` + `app.use(helmet())` como primer middleware |
| `backend/package.json` + `pnpm-lock.yaml` | `pnpm add helmet` |
| `backend/test/e2e/regressions.e2e-spec.ts` | Nuevo `describe` con tests SQL injection + XSS |

**Fuera de scope**: k6 load tests (T4.2), Swagger/OpenAPI (T4.4) — changes separados.

---

## Approach

- Sin migraciones de base de datos
- Sin nuevos módulos NestJS
- Sin cambios a `openspec/specs/**` existentes
- Strict TDD activo: test en rojo primero para T4.3c, luego fix

---

## Orden de implementación (por prioridad)

1. **T4.3c** primero — bug funcional, rompe dedup silenciosamente  
2. **T4.3a** segundo — cambio de 3 líneas, alto impacto seguridad  
3. **T4.3b** tercero — cobertura de tests, valida que los dos anteriores no introdujeron regresiones  
