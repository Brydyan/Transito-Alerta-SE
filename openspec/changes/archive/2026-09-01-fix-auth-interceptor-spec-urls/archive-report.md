# Archive Report: fix auth.interceptor.spec.ts URLs

**Change**: `2026-09-01-fix-auth-interceptor-spec-urls`
**Archived**: 2026-09-02
**Archiver**: Claude (SDD Archive Executor)
**Project**: Transito-Alerta-SE
**Artifact Store**: openspec

---

## Executive Summary

`auth.interceptor.spec.ts` afirmaba contra un prefijo `/api/v1/` inexistente en el
sistema (backend usa `setGlobalPrefix('api')` sin `enableVersioning`). Dos de cinco
tests fallaban de forma permanente, cortando el job `frontend` del CI antes del build
y bloqueando el merge de F0 y de todas las fases siguientes. Se reemplazaron las 12
apariciones de `/api/v1/` por `/api/`, se dejaron intactas las aserciones de
cuerpo/cabecera (que sí verificaban contrato real), y se agregó
`auth.interceptor.regression.spec.ts` como red anti-reincidencia. Cero cambios en
código de producción. Verificado en la 2ª pasada de `sdd-verify` de F0 (7/7 verde en
el directorio del interceptor); DoD cumplido.

---

## Decisión clave (D1/D2 en `design.md`)

- **D1**: se corrige el test, no se introduce versionado de API. El código de
  producción es correcto en ambos lados (frontend y backend); el único artefacto
  discrepante era el test, escrito contra un plan (`docs/tasks/0-OVERVIEW.md:92`) que
  nunca se implementó tal cual.
- **D2**: se corrigieron las **11/12** apariciones, no sólo las 2 que fallaban — 3 de
  los 5 tests pasaban "en falso" porque emitían y esperaban el mismo literal
  inventado (`/api/v1/incidents`), sin tocar código real.
- **D3**: las URLs siguen como literales escritos a mano (no se importa
  `environment.apiUrl` en el spec), para que el test conserve una opinión
  independiente del contrato.

---

## Specs Synced to Main Specs

| Domain | Action | Details |
|--------|--------|---------|
| auth (existente) | **Modified** | `openspec/specs/auth/spec.md` — R3 (Token Refresh) y R6 (JWT Injection) ganan una nota de contrato de rutas (`setGlobalPrefix('api')` + `@Controller`, sin segmento de versión) y R3.1/R3.2 corrigen `/auth/refresh` → `/api/auth/refresh`. Se agregó R6.3 (interceptor test suite targets real routes) |

**Nota de decisión**: el delta original declaraba una capability nueva `auth-session`.
Se descartó esa capability y se mergeó el contenido en la `auth` existente
(`openspec/specs/auth/spec.md`, que ya cubre login/refresh/logout/interceptor) para
evitar dos capabilities cubriendo el mismo dominio. El delta original
(`specs/auth-session/spec.md`) se conserva íntegro en este archivo como registro de
qué se propuso, pero **no** se copió como capability nueva a `openspec/specs/`.

---

## Archive Contents

- `proposal.md` ✅
- `design.md` ✅ (D1–D3 + contrato verificado)
- `tasks.md` ✅ (T1–T4, DoD)
- `apply-progress.md` ✅ (confirmaciones T1, 12 reemplazos, gates)
- `specs/auth-session/spec.md` ✅ (delta original — no se creó como capability nueva, ver nota arriba)

No existen `verify-report.md` ni `fixes-required.md` propios: este change se verificó
como parte de la 2ª pasada de `sdd-verify` de F0 (ver
`openspec/changes/archive/2026-08-29-f0-design-system-mock-alignment/verify-report.md`
y `fixes-required.md`, Ronda 1, sección "Dato de contexto: el job de frontend del CI
está en rojo").

---

## Source of Truth Updated

- `openspec/specs/auth/spec.md` — R3 y R6 ahora fijan como contrato que las rutas de
  auth no llevan segmento de versión

---

## Archival Checklist

- [x] Todos los artefactos leídos y verificados
- [x] Delta mergeado en `openspec/specs/auth/spec.md` (R3, R6) — sin crear capability
  `auth-session` duplicada, por decisión explícita del usuario
- [x] Carpeta del change copiada a
  `openspec/changes/archive/2026-09-01-fix-auth-interceptor-spec-urls/`
- [ ] **Carpeta original
  `openspec/changes/front/2026-09-01-fix-auth-interceptor-spec-urls/` eliminada** —
  **NO completado**, mismo motivo que el change F0: sin herramienta de shell/borrado
  disponible para este ejecutor.

**Archive Date**: 2026-09-02
**Archived By**: Claude (SDD Archive Executor)
**Project**: Transito-Alerta-SE
**Change**: 2026-09-01-fix-auth-interceptor-spec-urls
**Status**: CLOSED — contenido archivado; **pendiente borrado manual de la carpeta origen**
