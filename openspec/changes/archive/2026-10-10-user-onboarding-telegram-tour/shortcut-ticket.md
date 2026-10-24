# Ticket Shortcut — Onboarding de Staff, Selección de Departamento y Tour Telegram por Rol

> Formato listo para vincular o importar en Shortcut.
> **Epic**: ⚠️ GeoReporta (ID: `192`, workspace: `upse`)
> **Workspace URL**: `https://app.shortcut.com/upse/epic/192`

---

## Story Principal

**Name**
```
F7.ONBOARD — Onboarding de Staff, Selección de Departamento y Tour Telegram por Rol
```

**Type**: Feature  
**Epic**: ⚠️ GeoReporta (Epic 192)  
**Estimate**: 8 pts (~24h)  
**Story ID**: [sc-436](https://app.shortcut.com/upse/story/436)  
**Labels**: `onboarding`, `telegram`, `departments`, `rbac`, `mail`, `backend`, `frontend`  
**Branch sugerida**: `brydyan/sc-436/user-onboarding-telegram-tour`  

**Description**
```markdown
## Contexto y Motivación

Actualmente el flujo de alta y vinculación de operadores/administradores presenta fricciones críticas:
1. `users.department_id` existe en base de datos (`0056_departments.sql`), pero no está mapeado en `UserEntity`, `AdminCreateUserDto` ni en el formulario del frontend.
2. Los roles globales (`master`, `operador_sistema`) no deben asociarse a ninguna organización ni departamento; en cambio, los roles organizacionales (`admin_org`, `operador_org`) deben requerir obligatoriamente ambos.
3. Para la notificación de emergencias F7, `users.telegram_chat_id` (`0069`) requiere que el operador interactúe primero con el bot. Actualmente no hay vinculación automatizada.
4. Falta orientación inicial: el correo no explica las funciones operativas según el rol otorgado.

## Solución Técnica

1. **Persistencia y Selección Condicional**:
   - Mapear `departmentId` en `UserEntity`.
   - Validar en `UsersService`: `master`/`operador_sistema` fuerzan `organizationId = null` y `departmentId = null`. `admin_org`/`operador_org` exigen ambos con validación de pertenencia.
   - Endpoint `GET /api/users/form-data` entrega lista de departamentos vinculados a sus organizaciones.
2. **Vinculación Telegram vía Deep-Link**:
   - Generación de token efímero en Redis (TTL 24h: `telegram:link:<token> -> userId`).
   - Deep-link `https://t.me/<BOT_USERNAME>?start=<token>` en correo y activación de cuenta.
   - Handler de webhook para `/start <token>` asocia `telegram_chat_id` e invalida el token.
3. **Tour Educativo por Rol**:
   - Entrega inmediata por bot de Telegram y correo de invitación con guía operativa según rol (`master`, `operador_sistema`, `admin_org`, `operador_org`).
4. **Aislamiento Estricto de Ciudadanos (`reporter`)**:
   - Los ciudadanos se auto-registran (`auth.register.ts` + OTP email). Cero invitaciones de master, cero bots de Telegram y cero tours operativos.

## Criterios de Aceptación (DoD)

- [ ] `departmentId` persistido en `UserEntity` y admitido en `AdminCreateUserDto`.
- [ ] Reglas de obligatoriedad según rol verificadas por tests unitarios en backend.
- [ ] Deep-link de Telegram emitido con token de 24h en Redis y validado al ejecutar `/start`.
- [ ] `telegram_chat_id` persistido automáticamente en el usuario al presionar Iniciar.
- [ ] Mensaje de tour personalizado enviado por Telegram según el rol del usuario.
- [ ] Plantilla de correo de invitación incluye botón de Telegram y resumen del rol.
- [ ] Formulario frontend (`NewUserFormComponent`) filtra reactivamente departamentos por organización y oculta ambos para `master`/`operador_sistema`.
- [ ] Cero regresiones en flujo ciudadano de registro (`auth.register.spec.ts`).
- [ ] Suite de pruebas pasando (`pnpm test`) y builds limpios en backend y frontend.

## Artefactos SDD de Referencia

`openspec/changes/back/2026-10-10-user-onboarding-telegram-tour/`
- `proposal.md`
- `specs/user-onboarding/spec.md`
- `design.md`
- `tasks.md`
```

---

## Tareas Internas en Story (Checklist)

Las 5 fases de ejecución se gestionan como checklist interno dentro del ticket único **[sc-436](https://app.shortcut.com/upse/story/436)**:

- [ ] **Fase 1**: Persistencia y Selección Condicional de Org/Depto en Backend (`UserEntity`, DTOs, `UsersService`) (Task 441)
- [ ] **Fase 2**: Tokens de Vinculación y Manejo de `/start` en Bot de Telegram (`Redis` TTL 24h, Webhook, `TOUR_PROFILES`) (Task 442)
- [ ] **Fase 3**: Enriquecimiento de Correo de Invitación para Staff (`MailService`, deep-link Telegram, mini-guía) (Task 443)
- [ ] **Fase 4**: Integración en Frontend (`NewUserFormComponent` select reactivo, validación, botón Vincular) (Task 444)
- [ ] **Fase 5**: Verificación Integral y Aislamiento Ciudadano (`typecheck`, tests backend, tests frontend) (Task 445)
