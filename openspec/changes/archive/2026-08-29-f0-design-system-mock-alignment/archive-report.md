# Archive Report: F0 — Design System Alignment

**Change**: `2026-08-29-f0-design-system-mock-alignment`
**Archived**: 2026-09-02
**Archiver**: Claude (SDD Archive Executor)
**Project**: Transito-Alerta-SE
**Artifact Store**: openspec

---

## Executive Summary

F0 reemplaza la paleta navy/hi-vis por la paleta violeta del mock (`docs/mock/`),
sustituye Barlow Condensed por Outfit, unifica la iconografía en Lucide, reescribe el
sidebar a fondo blanco con secciones y entrega seis primitivos de UI standalone
(`ui-badge`, `ui-card`, `ui-button`, `ui-table`, `ui-page-header`, `ui-kpi-card`). Pasó
por **cuatro rondas** de `sdd-verify` (FAIL inicial con 2 CRITICAL → PASS WITH WARNINGS
en las tres siguientes). Veredicto final: **0 CRITICAL · 2 WARNING · 2 SUGGESTION**,
192/192 tests, build y `tsc` limpios. Se archiva.

---

## Decisiones de arquitectura clave (D1–D12)

Registradas en `design.md`. Las más relevantes para lectura futura:

- **D1**: paleta violeta como reemplazo total del navy/hi-vis (no tema alterno)
- **D9**: cuatro prioridades (no tres) — `critical` ya existía en el dominio, sólo no
  se había maquetado; es la base del reporte de emergencia
- **D10**: badges con patrón **tintado** (fondo alfa bajo + texto profundo), `critical`
  como única excepción sólida — el mock pedía sólido uniforme, que falla WCAG AA en 5/8
  variantes
- **D11**: el escenario "hi-vis retirado" se acota a `layout/` + `styles/`; los alias
  de puente sobreviven con ticket (sc-323, F6) porque retirarlos rompe el build
  (Tailwind 4 falla duro en `@apply` sobre utilidades desconocidas)
- **D12**: el requisito de contraste ≥4.5:1 alcanza también a `ui-kpi-card`, no sólo a
  badges — tres tonos (`cyan`, `green`, `red`) emparejaban mal con `text-white`

## Trazabilidad de la auditoría

| Ronda | Veredicto | Hallazgos | Cerrado en |
|---|---|---|---|
| 1 | FAIL | 2 CRITICAL · 5 WARNING · 2 SUGGESTION | v3/v4 |
| 2 | PASS WITH WARNINGS | 3 (R2.1–R2.3) | v5 |
| 3 | PASS WITH WARNINGS | 3 (R3.1–R3.3) | v6 |
| 4 (final) | **PASS WITH WARNINGS** | 2 WARNING · 2 SUGGESTION — no bloqueantes, imprecisiones de comentarios/docs | — (aceptado tal cual) |

Detalle completo en `fixes-required.md` (rondas 1–3) y `verify-report.md` (ronda 4,
final).

---

## Specs Synced to Main Specs

| Domain | Action | Details |
|--------|--------|---------|
| design-system | **Created** (capability nueva) | `openspec/specs/design-system/spec.md` — 6 requirements, 20 scenarios. Se omitió la sección "Revisión 2026-09-01" del delta (histórico del change, no requisito vigente); ese rastro queda en este archivo |

---

## Archive Contents

- `proposal.md` ✅
- `design.md` ✅ (D1–D12)
- `tasks.md` ✅ (F0.1–F0.5, DoD completo, todos los ítems `[x]`)
- `apply-progress.md` ✅ (v1–v6, incluye desviaciones y pendientes para F1–F6)
- `verify-report.md` ✅ (4ª pasada, final)
- `fixes-required.md` ✅ (rondas 1–3 completas)
- `specs/design-system/spec.md` ✅ (delta original, con la sección "Revisión" intacta como
  rastro histórico)

---

## Source of Truth Updated

- `openspec/specs/design-system/spec.md` — nueva capability, source of truth para
  tokens, tipografía, iconografía y primitivos de UI del frontend

---

## Pendientes para fases siguientes (no bloqueantes, documentados en `apply-progress.md`)

1. Migrar `features/admin/**`, `features/auth/**`, `features/profile/**`,
   `features/reports/**` a los tokens/primitivos de F0 (F1–F6)
2. Reemplazar `bi bi-*` restantes por `<ui-icon>` fuera de `shared/components/`
3. Retirar los alias `--color-brand-navy*` / `--color-brand-hivis*` y
   `--color-status-pending/critical/info/success` de `_variables.css` (sc-323, F6)
4. Ticket aparte: `eslint.config.*` (flat config) para que `pnpm lint` sea ejecutable
5. Sidebar agrupado por `group`: el campo existe (D4) pero `menu.service.ts` no lo
   popula todavía — es F1 (W-4, diferido explícitamente)

---

## Archival Checklist

- [x] Todos los artefactos leídos y verificados
- [x] Delta spec mergeado a `openspec/specs/design-system/spec.md` (capability nueva)
- [x] Carpeta del change copiada a `openspec/changes/archive/2026-08-29-f0-design-system-mock-alignment/`
- [x] Verificado 0 CRITICAL en el reporte de verificación final
- [ ] **Carpeta original `openspec/changes/front/2026-08-29-f0-design-system-mock-alignment/`
  eliminada** — **NO completado**: el ejecutor de este archivado no tuvo acceso a una
  herramienta de shell/borrado de archivos, sólo a Read/Write/Edit/Glob. Los archivos
  quedaron **duplicados** en origen y destino. Ver sección de riesgos del reporte final.

**Archive Date**: 2026-09-02
**Archived By**: Claude (SDD Archive Executor)
**Project**: Transito-Alerta-SE
**Change**: 2026-08-29-f0-design-system-mock-alignment
**Status**: CLOSED — contenido archivado; **pendiente borrado manual de la carpeta origen**
