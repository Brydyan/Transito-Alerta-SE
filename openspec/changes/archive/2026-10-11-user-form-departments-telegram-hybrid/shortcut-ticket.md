# Ticket Shortcut — Formulario con Departamentos y Vinculación Híbrida de Telegram

> Formato listo para vincular o consultar en Shortcut.
> **Epic**: ⚠️ GeoReporta (ID: `192`, workspace: `upse`)
> **Workspace URL**: `https://app.shortcut.com/upse/epic/192`

---

## Story Principal

**Name**
```
F7.ONBOARD-UI — Formulario con Departamentos y Vinculación Híbrida de Telegram
```

**Type**: Feature  
**Epic**: ⚠️ GeoReporta (Epic 192)  
**Estimate**: 8 pts (~24h)  
**Story ID**: [sc-446](https://app.shortcut.com/upse/story/446)  
**Labels**: `frontend`, `onboarding`, `telegram`, `departments`, `security`  
**Branch sugerida**: `brydyan/sc-446/user-form-departments-telegram-hybrid`  

**Description**
```markdown
## Contexto y Motivación

El backend ya completó la persistencia de Telegram (migración 0069), la validación de org+dept y el envío de tours por correo (sc-436). Sin embargo, en el frontend:
1. `NewUserFormComponent` no tiene el selector de Departamento ni envía `department_id`, provocando HTTP 400 al crear roles seccionales (`admin_org`, `operador_org`).
2. Los roles globales (`master`, `operador_sistema`) no ocultan la sección de entidad.
3. Si el enlace de Telegram del correo expira (TTL 24h), el staff no tiene mecanismo self-service autenticado para re-vincularse.

## Solución: Modo Híbrido Seguro

- **Backend**: Endpoint quirúrgico autenticado `POST /api/users/me/telegram-link` (JwtAuthGuard, roles staff, rate limit) para generar token fresco a demanda.
- **Frontend Modelos**: Tipar `Department` y `departmentId` en `user.interface.ts`; actualizar `UsersService.getFormData()`.
- **Frontend Formulario**: `<select>` reactivo de Departamento filtrado por organización; validación condicional por rol en `isFormValid()`.
- **Frontend Perfil**: Tarjeta en `profile-action-cards` con estado de vinculación y botón seguro para abrir Telegram o escanear QR.

## Criterios de Aceptación (DoD)

- [ ] `POST /api/users/me/telegram-link` genera URL segura para staff autenticado.
- [ ] `NewUserFormComponent` permite seleccionar departamento filtrado por organización.
- [ ] Creación de `admin_org`/`operador_org` pasa en backend con 201 Created.
- [ ] `master`/`operador_sistema` ocultan o deshabilitan sección de organización y departamento.
- [ ] Perfil muestra estado de vinculación a Telegram y botón de generación segura.
- [ ] 100% tests unitarios pasando en frontend y backend sin regresiones.

## Artefactos SDD de Referencia

`openspec/changes/front/2026-10-11-user-form-departments-telegram-hybrid/`
- `proposal.md`
- `specs/user-onboarding-ui/spec.md`
- `design.md`
- `tasks.md`
```

---

## Tareas Internas en Story (Checklist)

Las 5 fases de ejecución se gestionan como checklist interno dentro del ticket único **[sc-446](https://app.shortcut.com/upse/story/446)**:

- [ ] **Fase 1**: Backend — Endpoint `POST /api/users/me/telegram-link` con JwtAuthGuard y rate limit (Task 448)
- [ ] **Fase 2**: Frontend Modelos — Interface Department, departmentId y mapeo en `UsersService.getFormData()` (Task 449)
- [ ] **Fase 3**: Frontend Formulario — Select de Departamento reactivo, filtrado por org y validación condicional en `NewUserFormComponent` (Task 450)
- [ ] **Fase 4**: Frontend Perfil — Tarjeta de vinculación de Telegram en `profile-action-cards` con estado dinámico (Task 451)
- [ ] **Fase 5**: Verificación Integral — Tests unitarios frontend (form, service, profile) + tests backend y gates CI (Task 452)
