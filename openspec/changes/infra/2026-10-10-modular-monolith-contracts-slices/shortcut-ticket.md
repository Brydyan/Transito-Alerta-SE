# Ticket Shortcut — Modular Monolith, Vertical Slices y Shared Contracts

> Formato listo para vincular o importar en Shortcut.
> **Epic**: ⚠️ GeoReporta (ID: `192`, workspace: `upse`)
> **Workspace URL**: `https://app.shortcut.com/upse/epic/192`

---

## Story Principal

**Name**
```
ARCH — Modular Monolith, Vertical Slices y Shared Contracts (@tase/contracts)
```

**Type**: Feature  
**Epic**: ⚠️ GeoReporta (Epic 192)  
**Estimate**: 13 pts (~40h)  
**Labels**: `architecture`, `monorepo`, `contracts`, `refactor`, `frontend`, `backend`  
**Branch sugerida**: `brydyan/sc-XXX/modular-monolith-contracts-slices`  

**Description**
```markdown
## Contexto y Motivación

Actualmente el monorepo presenta desacoplamiento estructural y falta de tipado común:
1. `IncidentStatus` y otros enums/modelos están duplicados manualmente en backend y frontend sin contrato compartido.
2. `backend/src/modules/` cuenta con 24 módulos planos sin límites de contexto (Bounded Contexts).
3. `frontend/src/app/core/services/` almacena 38 servicios planos mezclando infraestructura con dominios de negocio.
4. La raíz carece de un workspace unificado pnpm y path aliases en TypeScript, provocando imports relativos frágiles (`../../..`).

Esta feature implementa la **Opción 1**:
- **Pilar 1: Shared Contracts (`@tase/contracts`)** como única fuente de verdad para tipos, enums y DTOs de red.
- **Pilar 2: Backend Domain-Driven Modular Monolith** estructurado en 4 Bounded Contexts (`incidents`, `iam`, `gis`, `comms`) + capas `infra/` y `shared/`.
- **Pilar 3: Frontend Vertical Slice Architecture** en `features/` (`data-access/`, `ui/`, `feature/`, `utils/`) y saneamiento de `core/`.
- **Pilar 4: Workspace pnpm unificado y Path Aliases** (`@tase/contracts`, `@domains/*`, `@infra/*`, `@shared/*`).

## Restricciones y Principios

- Cero migraciones SQL (esquema de base de datos permanece 100% idéntico).
- Cero cambios en el contrato HTTP wire (respuestas permanecen en `snake_case` vía `SnakeCaseResponseInterceptor`).
- Cero impacto en despliegue Docker (`compose.yaml` ya usa la raíz como contexto de build).
- Ejecución en 5 fases atómicas sin romper la suite de pruebas.

## Criterios de Aceptación (DoD)

- [ ] Paquete `packages/contracts/` creado y vinculado vía `workspace:*` en backend y frontend.
- [ ] Enums y tipos de ciclo de vida (`IncidentStatus`, roles) importados desde `@tase/contracts`.
- [ ] `pnpm run typecheck` en backend y `pnpm run build` en frontend pasan en 0 errores.
- [ ] 24 módulos del backend reorganizados en 4 Bounded Contexts bajo `backend/src/domains/`.
- [ ] Feature `incidents` en frontend estructurada en rodajas verticales (`data-access`, `ui`, `feature`, `utils`).
- [ ] `frontend/src/app/core/services/` saneado; servicios de dominio reubicados a sus rodajas verticales.
- [ ] Docker build hermético exitoso: `docker compose --profile staging build backend`.
- [ ] 100% suites de tests pasando en ambas aplicaciones (`pnpm test`).

## Artefactos SDD de Referencia

`openspec/changes/infra/2026-10-10-modular-monolith-contracts-slices/`
- `proposal.md`
- `specs/architecture/spec.md`
- `design.md`
- `tasks.md`
```

---

## Desglose de Sub-Stories (Una por Fase)

### Sub-story 1: Setup Workspace y Paquete `@tase/contracts`
- **Name**: `ARCH.1 — Setup de Workspace pnpm y Creación de @tase/contracts`
- **Type**: Feature | **Estimate**: 3 pts
- **Description**: Configuración de `pnpm-workspace.yaml` raíz y creación del paquete de contratos TypeScript puro en `packages/contracts/` con enums y DTOs canónicos (`IncidentStatus`, `UserRole`, etc.).

### Sub-story 2: Integración de Contratos y Path Aliases
- **Name**: `ARCH.2 — Path Aliases y Reemplazo de Tipos Huérfanos`
- **Type**: Feature | **Estimate**: 2 pts
- **Description**: Configuración de `compilerOptions.paths` en `tsconfig.json` de backend y frontend; reemplazo de definiciones manuales de `IncidentStatus` en backend y frontend por el paquete común.

### Sub-story 3: Reorganización Modular de Backend por Dominios (DDD)
- **Name**: `ARCH.3 — Backend: Modular Monolith en 4 Bounded Contexts`
- **Type**: Feature | **Estimate**: 3 pts
- **Description**: Agrupación de los 24 módulos en `backend/src/domains/` (`incidents/`, `iam/`, `gis/`, `comms/`) + consolidación de capas `infra/` y `shared/`.

### Sub-story 4: Frontend Vertical Slices y Limpieza de Core
- **Name**: `ARCH.4 — Frontend: Vertical Slice Architecture y Saneamiento de Core`
- **Type**: Feature | **Estimate**: 3 pts
- **Description**: Reestructuración de `features/incidents/` en rodajas (`data-access/`, `ui/`, `feature/`, `utils/`) y migración de servicios de dominio desde `core/services/` hacia sus features.

### Sub-story 5: Docker Hermético y Gates Finales
- **Name**: `ARCH.5 — Dockerfile Monorepo y Verificación Integral de Gates`
- **Type**: Feature | **Estimate**: 2 pts
- **Description**: Adaptación de `backend/Dockerfile` para resolver el workspace en build hermético; validación de `typecheck`, `test` y `build` completos en backend y frontend.
