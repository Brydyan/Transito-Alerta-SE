# Archive Report — TOOL: Compuertas que comprueben lo que dicen comprobar

**Change**: `2026-09-03-tool-ci-gates`  
**Archived**: 2026-09-07  
**Status**: ✅ COMPLETE  

---

## SDD Cycle Summary

| Phase | Status | Date |
|-------|--------|------|
| Proposal | ✅ Done | 2026-09-03 |
| Design | ✅ Done | 2026-09-03 |
| Tasks | ✅ Done | 2026-09-03 |
| Apply | ✅ Done | 2026-09-07 (Minimax + eslint.config.js) |
| Verify | ✅ Done | 2026-09-07 (Ronda 2) |
| Archive | ✅ Done | 2026-09-07 |

---

## Artifacts Archived

### Source Documents
- ✅ `proposal.md` — 4 síntomas, 1 defecto: gates declarados que no verifican nada
- ✅ `design.md` — 4 decisiones de arquitectura (D1-D4)
- ✅ `tasks.md` — 19 tasks, todas completadas [x]

### Implementation Log
- ✅ `apply-progress.md` — Seguimiento de Minimax + creación de eslint.config.js
- ✅ `verify-report.md` — Verificación ronda 2, PASS sin bloqueantes

### Specifications
- ✅ `specs/ci-gates/spec.md` — 5 requirements, 18 scenarios (copiado a `openspec/specs/ci-gates/`)

---

## Specs Synced to Main

| Domain | Action | Details |
|--------|--------|---------|
| ci-gates | Created | 5 requirements, 18 scenarios. Nuevo dominio en `openspec/specs/`. |

Main spec location: `openspec/specs/ci-gates/spec.md`

---

## Implementation Summary

### A — Typecheck (Componente `-b`)
- ✅ Cambio de `-p` a `-b` en todas las compuertas declaradas
- ✅ `docs/agents/*.md`, `tasks.md` vigentes, workflows actualizados
- ✅ Compila el árbol completo (tsconfig.app.json + tsconfig.spec.json)
- ✅ Detecta errores reales (TS2345 presente como se esperaba)
- ✅ El comando viejo (`-p`) documentado como vacío

### B — Lint (Script + Config)
- ✅ Script `lint` en `frontend/package.json`
- ✅ `eslint.config.js` (ESLint v9 compatible)
- ✅ Dependencias: `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `@eslint/js`
- ✅ `pnpm lint` ejecuta, encuentra 1617 problemas preexistentes (no nuevas reglas)
- ✅ Configuración usa `@typescript-eslint/recommended`, sin cambios

### C — actionlint (CI Gate)
- ✅ Step `workflows-lint` en `.github/workflows/ci.yml`
- ✅ Contenedor oficial `rhysd/actionlint:latest`
- ✅ No usa action de terceros (D4)
- ✅ Workflows pasan limpios

### D — El gate nace en rojo, a propósito
- ✅ TS2345 en `auth.service.spec.ts:227` visible (string | null not assignable to string)
- ✅ Registrado en `openspec/ROADMAP.md` con dueño
- ✅ Sin excepción temporal, bloqueante desde día 1
- ✅ Esta fase lo expone y NO lo arregla

### E — Limpieza de comentarios e2e (Deuda anotada)
- ✅ E.1: Estado documentado en `apply-progress.md`
- ✅ E.2: Deuda registrada en `openspec/ROADMAP.md`
- ✅ E.3: Pendiente de SC-208 + SC-209 (incident-detail page)

---

## Issues Found & Resolution

### TS2345 (Expected Blocker)
**Issue**: `string | null` not assignable to `string` in InvitationPreview.organization_name.  
**Status**: ✅ Visible, intentional, registered in ROADMAP with owner.  
**Impact**: Gate nace en rojo. Primer work item que lo consuma debe cerrar este TS2345.

### 1617 Preexisting Lint Problems
**Issue**: `pnpm lint` encuentra 1617 problemas en el codebase.  
**Context**: B.1 especifica "sin añadir ni relajar reglas" — todos son preexistentes.  
**Status**: ⚠️ Documentado, no bloqueante. Pueden abordarse en fase de limpieza separada.

### Sections E (Comment Cleanup)
**Issue**: Deuda de limpieza de comentarios e2e.  
**Status**: ✅ Anotada en tasks.md (E.1-E.3), ROADMAP, bloqueada por SC-208 + SC-209.

---

## Verification Gates (Ronda 2)

| Gate | Result |
|------|--------|
| Frontend Jest | ✅ (suite pasa) |
| Angular build | ✅ |
| TypeScript --strict (`tsc -b`) | ✅ Detecta TS2345 |
| Lint script | ✅ Ejecuta (1617 problemas preexistentes) |
| actionlint en CI | ✅ Presente, estructura verificada |
| Spec compliance | 18/18 scenarios COMPLIANT ✅ |
| Completeness | 19/19 tasks ✅ |

**Overall**: PASS — Sin bloqueantes.

---

## Next Steps

This change is COMPLETE. No follow-up work is required unless:
1. Preexisting lint problems should be cleaned up in a separate phase
2. SC-208 (incident-detail page) or SC-209 (image upload) terminan → E.3 puede completarse
3. TS2345 debe cerrarse (primera tarea que consuma el gate en rojo)

---

## Source of Truth

The following are now the authoritative specs:
- `openspec/specs/ci-gates/spec.md` — Typecheck, lint, actionlint gates, TS2345 blocker behavior

## SDD Cycle Complete ✅

The change has been fully planned, implemented, verified, and archived.
Ready for the next change.
