# Implementation Tasks: Modular Monolith, Vertical Slices y Shared Contracts

> **Epic Shortcut**: ⚠️ GeoReporta (Epic 192, workspace `upse`)  
> **Tickets Desglosados**: [`shortcut-ticket.md`](file:///home/andy/Escritorio/PROYECTOS/TASE/Transito-Alerta-SE/openspec/changes/infra/2026-10-10-modular-monolith-contracts-slices/shortcut-ticket.md) (`ARCH.1` a `ARCH.5`)

## Fase 1 — Configuración del Workspace y Creación de `@tase/contracts` (ARCH.1)

- [ ] 1.1 Crear archivo `pnpm-workspace.yaml` en la raíz del repositorio declarando `['backend', 'frontend', 'packages/*']`.
- [ ] 1.2 Inicializar el paquete `packages/contracts/package.json` con `name: "@tase/contracts"`, `version: "1.0.0"` y script de typecheck.
- [ ] 1.3 Configurar `packages/contracts/tsconfig.json` con configuración estricta de TypeScript.
- [ ] 1.4 Extraer y centralizar enums y constantes en `packages/contracts/src/enums/`:
  - `IncidentStatus`, `IncidentPriority`, `IncidentSource`.
  - Roles canónicos: `UserRole` (`master`, `operador_sistema`, `admin_org`, `operador_org`, `reporter`).
- [ ] 1.5 Extraer y tipar DTOs de wire compartidos en `packages/contracts/src/dtos/`:
  - `IncidentResponseDto`, `CreateIncidentDto`, `UpdateIncidentStatusDto`.
  - `UserSummaryDto`, `DepartmentSummaryDto`, `OrganizationSummaryDto`.
- [ ] 1.6 Exportar todos los símbolos en `packages/contracts/src/index.ts`.
- [ ] 1.7 Ejecutar `pnpm install` desde la raíz para vincular `@tase/contracts` en el monorepo.

## Fase 2 — Path Aliases y Vinculación Inicial de Contratos

- [ ] 2.1 Agregar dependencia `"@tase/contracts": "workspace:*"` en `backend/package.json` y `frontend/package.json`.
- [ ] 2.2 Configurar `compilerOptions.paths` en `backend/tsconfig.json`:
  - `@tase/contracts` → `["../packages/contracts/src"]`
  - `@domains/*` → `["src/domains/*"]`
  - `@infra/*` → `["src/infra/*"]`
  - `@shared/*` → `["src/shared/*"]`
- [ ] 2.3 Configurar `compilerOptions.paths` en `frontend/tsconfig.json` y `frontend/tsconfig.app.json`:
  - `@tase/contracts` → `["../packages/contracts/src"]`
  - `@core/*` → `["src/app/core/*"]`
  - `@features/*` → `["src/app/features/*"]`
  - `@shared/*` → `["src/app/shared/*"]`
- [ ] 2.4 Reemplazar definiciones manuales de `IncidentStatus` en backend (`incident.entity.ts`) por importación desde `@tase/contracts`.
- [ ] 2.5 Reemplazar definiciones manuales de `IncidentStatus` en frontend (`incident.model.ts`) por importación desde `@tase/contracts`.
- [ ] 2.6 Verificar typechecking en ambas capas: `pnpm run typecheck` en backend y `pnpm run build` en frontend.

## Fase 3 — Backend: Reorganización Modular por Dominios (DDD)

- [ ] 3.1 Crear estructura de carpetas en `backend/src/domains/`: `incidents/`, `iam/`, `gis/`, `comms/`.
- [ ] 3.2 Migrar módulos de Identidad y Accesos a `backend/src/domains/iam/`:
  - `auth`, `users`, `roles`, `permissions`, `sessions`, `invitations`, `audit`.
- [ ] 3.3 Migrar módulos de Incidencias a `backend/src/domains/incidents/`:
  - `incidents`, `assignments`, `comments`, `status-history`, `incident-categories`, `incident-social`.
- [ ] 3.4 Migrar módulos de Inteligencia Espacial a `backend/src/domains/gis/`:
  - `geo-zones`, `geofencing`, `map`.
- [ ] 3.5 Migrar módulos de Comunicación y Notificaciones a `backend/src/domains/comms/`:
  - `telegram`, `mail`, `realtime`, `notifications`.
- [ ] 3.6 Consolidar adaptadores externos en `backend/src/infra/` (TypeORM setup, Redis streams/client, storage MinIO).
- [ ] 3.7 Actualizar imports de módulos en `app.module.ts` y suites de tests unitarios/e2e usando `@domains/*` y `@shared/*`.
- [ ] 3.8 Ejecutar suite completa de tests de backend: `pnpm test` (verificar 22 suites pasando limpias).

## Fase 4 — Frontend: Refactorización a Vertical Slice Architecture

- [ ] 4.1 Reestructurar la feature principal `frontend/src/app/features/incidents/` en rodajas verticales:
  - `data-access/`: migrar `incident.service.ts` y señales de estado.
  - `ui/`: mover componentes visuales puros (dropdowns, cards, pills).
  - `feature/`: mover páginas contenedoras (`incident-list`, `incident-detail`, `tracking-panel`).
  - `utils/`: ubicar `workflow.util.ts`.
- [ ] 4.2 Depurar `frontend/src/app/core/services/`:
  - Reubicar servicios de dominio en el `data-access/` de sus features respectivas (`auth/`, `admin/`, `citizen/`).
  - Mantener en `core/` únicamente infraestructura web real (`auth.interceptor.ts`, `indexed-db.service.ts`, guards globales).
- [ ] 4.3 Actualizar rutas en `frontend/src/app/app.routes.ts` apuntando a las rodajas verticales reorganizadas.
- [ ] 4.4 Ejecutar suite de pruebas de frontend: `pnpm test` y verificar que la totalidad de las pruebas unitarias pasen.

## Fase 5 — Docker, CI/CD y Verificación Integral

- [ ] 5.1 Actualizar `backend/Dockerfile` en los stages `deps` y `build` para copiar `pnpm-workspace.yaml` y `packages/contracts/`.
- [ ] 5.2 Validar build de Docker localmente con `docker compose --profile staging build backend`.
- [ ] 5.3 Ejecutar verificación de tipos en backend: `pnpm run typecheck`.
- [ ] 5.4 Ejecutar build de producción en frontend: `pnpm run build`.
- [ ] 5.5 Ejecutar suites completas de pruebas unitarias en ambas aplicaciones (`pnpm test`).
