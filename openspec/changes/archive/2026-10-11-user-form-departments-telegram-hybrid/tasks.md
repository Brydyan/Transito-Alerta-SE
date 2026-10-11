# Implementation Tasks: User Form Departments & Hybrid Telegram Linking

> **Ticket Único Shortcut**: [sc-446](https://app.shortcut.com/upse/story/446)  
> **Epic**: ⚠️ GeoReporta (Epic 192, workspace `upse`)  
> **Detalle**: [`shortcut-ticket.md`](file:///home/andy/Escritorio/PROYECTOS/TASE/Transito-Alerta-SE/openspec/changes/front/2026-10-11-user-form-departments-telegram-hybrid/shortcut-ticket.md)

## Fase 1 — Backend: Endpoint `POST /api/users/me/telegram-link` (Task 448)

- [x] 1.1 Exponer `POST /api/users/me/telegram-link` en `backend/src/modules/users/users.controller.ts`.
- [x] 1.2 Agregar validación de rol interno (`master`, `operador_sistema`, `admin_org`, `operador_org`) y rechazar `reporter` con HTTP 403 Forbidden.
- [x] 1.3 Invocar `TelegramLinkService.issueFor(req.user.userId)` y retornar `{ telegram_link: deepLink }`.
- [x] 1.4 Escribir pruebas unitarias en `users.controller.spec.ts` para el endpoint de generación de link.

## Fase 2 — Frontend Modelos y Servicios (Task 449)

- [x] 2.1 Definir interfaces `Department` y actualizar `NewUserFormData` y `CreateUserJsonPayload` con `departmentId`/`department_id` en `frontend/src/app/features/admin/users/models/user.interface.ts`.
- [x] 2.2 Actualizar `UsersService.getFormData()` en `users.service.ts` para mapear el array `departments` retornado por el backend.
- [x] 2.3 Actualizar modelo `UserProfile` en `user.service.ts` para incluir `telegram_chat_id?: string | null`.
- [x] 2.4 Agregar método `getTelegramLink(): Observable<{ telegram_link: string }>` en `user.service.ts`.
- [x] 2.5 Actualizar y validar pruebas unitarias en `users.service.spec.ts`.

## Fase 3 — Frontend Formulario de Alta (`NewUserFormComponent`) (Task 450)

- [x] 3.1 Agregar signal `departments` y computed `filteredDepartments` en `new-user-form.component.ts`.
- [x] 3.2 Modificar `isFormValid`: requerir obligatoriamente `organizationId` y `departmentId` cuando el rol es `admin_org` u `operador_org`.
- [x] 3.3 Implementar lógica para roles globales (`master`, `operador_sistema`): forzar `organizationId = null` y `departmentId = null` y deshabilitar o contextualizar la sección.
- [x] 3.4 Agregar control `<select id="new-user-dept">` en `new-user-form.component.html` con etiquetas de obligatoriedad reactivas.
- [x] 3.5 Resetear `departmentId` a `null` al modificar la organización seleccionada.
- [x] 3.6 Incluir `department_id: d.departmentId` en el payload de `onSubmit()`.
- [x] 3.7 Actualizar suite de pruebas en `new-user-form.component.spec.ts`.

## Fase 4 — Frontend Perfil: Tarjeta de Vinculación de Telegram (Task 451)

- [x] 4.1 Incorporar 4ta tarjeta de acción en `profile-action-cards.component.ts`: "Notificaciones Telegram".
- [x] 4.2 Renderizar indicador visual: badge verde *"Vinculado"* si `telegram_chat_id` existe, o *"No configurado"* con botón *"Vincular bot de Telegram"*.
- [x] 4.3 Vincular acción de clic al método `user.service.ts:getTelegramLink()` y abrir la URL en una nueva pestaña (`window.open`).
- [x] 4.4 Agregar feedback visual con `ToastService` al disparar la generación del enlace.
- [x] 4.5 Crear pruebas unitarias para `profile-action-cards.component.spec.ts`.

## Fase 5 — Verificación Integral y Gates CI (Task 452)

- [x] 5.1 Ejecutar `pnpm run typecheck` en backend y frontend.
- [x] 5.2 Ejecutar suite de pruebas en frontend (`pnpm test new-user-form.component.spec`, `pnpm test users.service.spec`, `pnpm test profile`).
- [x] 5.3 Ejecutar suite de pruebas en backend (`pnpm test users.controller.spec`).
- [x] 5.4 Ejecutar `pnpm run build` en frontend y backend.
