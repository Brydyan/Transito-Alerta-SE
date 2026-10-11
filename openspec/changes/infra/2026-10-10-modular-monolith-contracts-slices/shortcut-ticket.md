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
**Story ID**: [sc-417](https://app.shortcut.com/upse/story/417)  
**Labels**: `architecture`, `monorepo`, `contracts`, `refactor`, `frontend`, `backend`  
**Branch sugerida**: `brydyan/sc-417/modular-monolith-contracts-slices`  

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

## Tareas Internas en Story (Checklist)

Las 5 fases de ejecución se gestionan como checklist interno dentro del ticket único **[sc-417](https://app.shortcut.com/upse/story/417)**:

- [ ] **Fase 1**: Setup Workspace pnpm y Creación de `@tase/contracts` (Task 431)
- [ ] **Fase 2**: Path Aliases y Reemplazo de Tipos Huérfanos (`@tase/contracts`, `@domains/*`, `@infra/*`, `@shared/*`) (Task 432)
- [ ] **Fase 3**: Backend Modular Monolith en 4 Bounded Contexts (`incidents`, `iam`, `gis`, `comms`) (Task 433)
- [ ] **Fase 4**: Frontend Vertical Slice Architecture (`incidents`) y Saneamiento de Core (38 servicios) (Task 434)
- [ ] **Fase 5**: Dockerfile Monorepo y Verificación Integral de Gates (`typecheck`, `tests`, `build`) (Task 435)
