# Implementation Tasks: User Onboarding, Department Selection & Telegram Tour

> **Ticket Único Shortcut**: [sc-436](https://app.shortcut.com/upse/story/436)  
> **Epic**: ⚠️ GeoReporta (Epic 192, workspace `upse`)  
> **Detalle**: [`shortcut-ticket.md`](file:///home/andy/Escritorio/PROYECTOS/TASE/Transito-Alerta-SE/openspec/changes/back/2026-10-10-user-onboarding-telegram-tour/shortcut-ticket.md)

## Fase 1 — Persistencia y Selección Condicional de Organización y Departamento (Backend) (Task 441)

- [x] 1.1 Mapear `departmentId` en `UserEntity` (`backend/src/modules/users/entities/user.entity.ts`).
- [x] 1.2 Agregar `department_id?: string` en `AdminCreateUserDto` y `AdminUpdateUserDto`.
- [x] 1.3 Implementar validación condicional en `UsersService.adminCreate`:
  - Roles `admin_org` y `operador_org`: `organization_id` y `department_id` obligatorios; verificar pertenencia `dept.organization_id === dto.organization_id`.
  - Roles `master` y `operador_sistema`: forzar `organizationId = null` y `departmentId = null`.
- [x] 1.4 Modificar `UsersService.getFormData` para incluir la lista de departamentos activos `{ id, name, organization_id }`.
- [x] 1.5 Crear pruebas unitarias en `users.service.spec.ts` y `admin-create-user.dto.spec.ts` para las reglas condicionales de roles.

## Fase 2 — Tokens de Vinculación y Manejo de `/start` (Backend Telegram) (Task 442)

- [x] 2.1 Crear servicio `TelegramLinkService` para generar y validar tokens en Redis (`telegram:link:<token>`, TTL 24h).
- [x] 2.2 Implementar método para componer deep-link `https://t.me/<BOT_USERNAME>?start=<token>`.
- [x] 2.3 Definir constantes y plantillas de Tour por Rol (`TOUR_PROFILES`) en `telegram/constants/tour-profiles.constants.ts` (`master`, `operador_sistema`, `admin_org`, `operador_org`).
- [x] 2.4 Implementar controlador o handler de webhook para procesar el comando `/start <token>`:
  - Validar token en Redis.
  - Actualizar `users.telegram_chat_id` con `msg.chat.id`.
  - Enviar mensaje de bienvenida y tour del rol vía `TelegramService.enqueue()`.
- [x] 2.5 Crear pruebas unitarias para `TelegramLinkService` y el procesador de comando `/start`.

## Fase 3 — Enriquecimiento de Correo de Invitación (Task 443)

- [x] 3.1 Actualizar `InvitationsService` para generar token de Telegram al crear la invitación para personal interno.
- [x] 3.2 Modificar plantilla de correo en `MailService` para incluir:
  - Botón de activación de cuenta.
  - Botón de enlace a Telegram con deep-link.
  - Resumen del rol y mini-guía de bienvenida.
- [x] 3.3 Validar pruebas unitarias de `mail.service.spec.ts` e `invitations.service.spec.ts`.

## Fase 4 — Integración en Frontend (NewUserForm y Activación) (Task 444)

- [ ] 4.1 Actualizar interfaces en `frontend/src/app/features/admin/users/models/user.interface.ts` con `departmentId` y modelo de `Department`.
- [ ] 4.2 Agregar campo `<select>` de Departamento en `new-user-form.component.html` con filtrado reactivo por `organizationId`.
- [ ] 4.3 Actualizar `isFormValid()` y lógica reactiva en `new-user-form.component.ts`:
  - `ROLES_REQUIRING_ORG_AND_DEPT = ['admin_org', 'operador_org']`: ambos campos obligatorios.
  - `master` y `operador_sistema`: ocultar o deshabilitar organización y departamento.
- [ ] 4.4 Agregar banner o botón de "Vincular Telegram" en la pantalla de bienvenida / activación de cuenta.
- [ ] 4.5 Actualizar y correr pruebas unitarias en `new-user-form.component.spec.ts`.

## Fase 5 — Verificación y Gates Finales (Task 445)

- [x] 5.1 Ejecutar `pnpm run typecheck` en backend.
- [x] 5.2 Ejecutar `pnpm test` en backend para módulos `users`, `departments`, `invitations`, `telegram`.
- [x] 5.3 Verificar aislamiento: correr suite `auth.register.spec.ts` y `email-verification.service.spec.ts` (flujo ciudadano intacto).
- [x] 5.4 Ejecutar `pnpm test` y `pnpm run build` en frontend.

> **Backend-only pass (2026-10-10).** Frontend (Fase 4) quedó fuera
> de esta ronda por decisión del arquitecto — el backend (Fases 1–3
> + 5) es commit-able independientemente. La integración Angular
> viene en una segunda ronda cuando haya confirmación del equipo
> frontend. Esto NO es un bloqueador: el endpoint
> `GET /api/users/form-data` ya retorna `departments[]` y el deep-link
> ya viaja en el correo, así que un frontend que consuma el API
> actual no necesita cambios en backend.
