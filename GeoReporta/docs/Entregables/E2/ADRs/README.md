# Architecture Decision Records (ADRs)

Este directorio contiene los registros de decisiones arquitectónicas (ADRs) del Sistema Web de Gestión de Incidencias Georreferenciadas. Cada ADR documenta una decisión arquitectónica significativa: el contexto, las opciones consideradas, la decisión tomada y sus consecuencias.

Los ADRs son inmutables una vez aceptados. Para cambiar una decisión, escribí un nuevo ADR que la sustituya (`Superseded by ADR-NNN`).

## Índice

| # | Título | Estado | Fecha |
|---|---|---|---|
| 0001 | [RBAC con tabla de permisos + patrón de policies](0001-rbac-permissions-table.md) | Accepted | 2026-07-07 |
| 0002 | [Auditoría inmutable vía trigger de PostgreSQL](0002-audit-postgresql-trigger.md) | Accepted | 2026-07-07 |
| 0003 | [Flujo de incidencias: claim / release / confirm](0003-incident-workflow-claim-release-confirm.md) | Accepted | 2026-07-07 |
| 0004 | [Multitenant por `organization_id` con scope en policies](0004-multitenant-organization-id.md) | Accepted | 2026-07-07 |
| 0005 | [Autenticación JWT stateless](0005-stateless-jwt-auth.md) | Accepted | 2026-07-07 |
| 0006 | [Frankenphp + Laravel Octane](0006-frankenphp-octane.md) | Superseded by 0007 | 2026-07-07 |
| 0007 | [Migrate Octane runtime from FrankenPHP to Swoole](0007-migrate-octane-swoole.md) | Accepted | 2026-07-21 |
| 0007 | [PostGIS para geolocalización](0007-postgis-geolocation.md) | Accepted | 2026-07-07 |

## Plantilla de un ADR

Cada ADR sigue esta estructura:

- **Status** — Proposed / Accepted / Deprecated / Superseded
- **Date** — Cuándo se tomó la decisión
- **Deciders** — Quién decidió
- **Context** — La situación que requería decisión
- **Considered Options** — Alternativas evaluadas
- **Decision** — Opción elegida y por qué
- **Consequences** — Positivas y negativas
- **Implementation** — Dónde vive la decisión en el código
- **References** — Links externos

## Relación con el SRS

Estos ADRs son el **porqué** detrás de varias secciones del [SRS v2.0](../Requisitos/SRS.md):

- ADR-0001 → sección 2.3 (clases de usuario) y 3.1.3 RF-SW-006 (RBAC)
- ADR-0002 → sección 3.6 RS-008 (auditoría inmutable)
- ADR-0003 → sección 3.2 RF-FUNC-009 a 011 (claim/release/confirm)
- ADR-0004 → sección 3.2 RF-FUNC-031 (scoping multitenant)
- ADR-0005 → sección 3.1.4 (interfaces de comunicación) y 3.6 RS-006
- ADR-0006 → sección 2.4 (ambiente operativo) y 3.3 RR-002
- ADR-0007 → sección 3.2 RF-FUNC-016 (PostGIS) y 4.1.3 (Incident.geom)
