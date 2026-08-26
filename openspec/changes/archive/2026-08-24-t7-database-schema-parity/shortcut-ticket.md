# Ticket Shortcut — T7 Database Schema Parity

> Contenido listo para pegar en Shortcut. Epic: **⚠️ GeoReporta**.
> Sigue el patrón de T6 (`sc-275` story principal + `sc-276`…`sc-283` sub-stories por grupo).

---

## Story principal

**Name**
```
T7 — Paridad de esquema de base de datos con GeoReporta
```

**Type**: Feature
**Epic**: ⚠️ GeoReporta
**Estimate**: 21 pts (~136h)
**Labels**: `backend`, `database`, `migrations`, `georeporta-parity`
**Branch sugerida**: `brydyan/sc-XXX/t7-database-schema-parity`

**Description**
```
T6 cerró la paridad funcional de API y servicios. La capa de datos nunca se auditó.

Auditamos las 72 migraciones Laravel, los 14 seeders, los datos geográficos y los
18 modelos Eloquent de /GeoReporta contra nuestras 29 migraciones SQL. Resultado:
26 gaps en 9 grupos, 10 migraciones nuevas (0030–0039).

## Estado medido

| Dimensión                       | GeoReporta        | TASE hoy |
|---------------------------------|-------------------|----------|
| Funciones + triggers PL/pgSQL   | 4 + 4             | 0 + 0    |
| Tablas con deleted_at           | 12                | 3        |
| Tablas con updated_at           | 16                | 3        |
| Tracking de migraciones         | tabla migrations  | ninguno  |
| Rollback ejercitado             | n/a               | 29 DOWN nunca ejecutados |
| Categorías de incidente sembradas | 23              | 0        |
| Organizaciones sembradas        | 11                | 0        |

## Lo que no es sólo esquema

Tres hallazgos son defectos de comportamiento, no gaps de columnas:

1. GET /organizations/notified-for no recorre la jerarquía de zonas, devuelve como
   mucho una organización (legacy devuelve todas las notificadas) y calcula
   is_claimable como max_active_claims > 0 cuando legacy lo define como identidad
   con findForLocation() — la org que el auto-assign elegiría.
2. uq_organizations_zone (UNIQUE por zona, de 0015) es incompatible con el modelo
   de legacy, donde varias orgs a distintos niveles del árbol se notifican para el
   mismo incidente. Hay que eliminarlo.
3. comments.parent_id no existe: responder un comentario es imposible, pese a que
   0005_comments.sql documenta "comentarios anidados". La profundidad máxima de
   legacy es 2, enforzada sólo en el frontend.

El defecto (1) está latente: organizations no tiene filas sembradas y geo_zones
tiene 4, así que hoy el endpoint devuelve [] pase lo que pase. No hay nada en
producción enrutando mal.

## Fuera de alcance (divergencias rechazadas con motivo)

- menus / menu_permission → menu-map.ts estático
- role_permission pivot → roles.permissions JSONB + caché Redis
- category_organization pivot → código muerto en legacy, no lo usa ninguna línea
- tabla images polimórfica → comment_images + incident_images tipadas
- ResolutionAudit / resolution_audits → código muerto en legacy (clase y tabla inexistentes)
- Triggers log_incident_status, auto_assign_location, notify_on_status_change →
  resueltos en capa de aplicación con Redis Streams + Socket.IO
- EcuadorLocationSeeder completo (24 provincias) → producto scopeado a Santa Elena

## Artefactos SDD

openspec/changes/infra/t7-database-schema-parity/
  proposal.md  — 26 gaps, alcance, riesgos
  specs/database-schema/spec.md — 22 requisitos, ~90 escenarios Given/When/Then
  design.md    — 12 decisiones, evidencia de auditoría, grafo de dependencias
  tasks.md     — 106 tareas atómicas en 9 grupos

## Criterios de aceptación

- [ ] 0030–0039 aplican limpio sobre base vacía y sobre el esquema actual con datos
- [ ] Re-aplicar 0030–0039 es inocuo (idempotencia)
- [ ] Ciclo completo up/down deja la base sin tablas de dominio
- [ ] SELECT count(*) FROM schema_migrations = 39
- [ ] Ninguna query de dominio devuelve filas con deleted_at IS NOT NULL
- [ ] UPDATE actualiza updated_at sin que el servicio la escriba
- [ ] notified-for devuelve todas las orgs notificadas, con ancestría de zona y de
      categoría, is_claimable en exactamente una y orden estable
- [ ] Insertar un incidente con category_id de una categoría padre → error de DB
- [ ] SELECT count(*) FROM incident_categories = 23 (5 raíces, 18 hojas)
- [ ] Suite completa verde: npm test && npm run test:e2e desde backend/
```

---

## Sub-stories (una por grupo)

| # | Name | Migración | Est. | Notas |
|---|------|-----------|------|-------|
| 1 | `T7.1 — Tooling de migraciones y saneamiento del log` | 0030 | ~17h | Tabla `schema_migrations`, runner idempotente con detección de drift por checksum, ciclo de rollback ejercitado, corregir `MIGRATION_LOG.md` (0024–0029 figuran ⏳ Pending y ya se aplicaron) |
| 2 | `T7.5 — Ruteo de organizaciones: ancestría de zona y categoría` | 0034 | ~21h | **Subir de prioridad**: único defecto de comportamiento del lote. Elimina `uq_organizations_zone`, añade `organizations.parent_id` e `incident_category_id`, reescribe `notifiedFor` con CTEs recursivas |
| 3 | `T7.2 — Soft delete completo` | 0031 | ~23h | `deleted_at` en 7 tablas + filtro en todos los repositorios |
| 4 | `T7.3 — Columnas updated_at y trigger set_updated_at` | 0032 | ~8h | 12 tablas + 15 triggers; `status_history` excluida (append-only) |
| 5 | `T7.4 — Comentarios anidados` | 0033 | ~9h | `parent_id`, profundidad máxima 2, cascada de soft delete con `WITH RECURSIVE` |
| 6 | `T7.6 — Columnas de dominio faltantes` | 0035 | ~6h | `geo_zones.code`, `users.phone` (+ wipe GDPR) |
| 7 | `T7.7 — Integridad a nivel de base` | 0036 | ~13h | Trigger `check_is_leaf_category`, normalización de las 6 FK sin `ON DELETE` y las 2 inconsistentes |
| 8 | `T7.8 — Paridad de índices` | 0037 | ~6h | 9 índices |
| 9 | `T7.9 — Datos de referencia y seeds` | 0038, 0039 | ~26h | Árbol de 23 categorías, permisos de `notifications`, parroquias de Santa Elena, organizaciones semilla, data de demo/volumen fuera del pipeline |

Cada sub-story: mismo Epic, label `backend` + `database`, y en la descripción el
enlace al grupo correspondiente de `tasks.md`.

---

## Bloqueante a registrar

Crear como **blocker** de la sub-story T7.9:

```
Name: Definir organizaciones reales del despliegue de Santa Elena

La migración 0039 siembra organizaciones. Necesitamos la lista real: nombre,
cantón al que pertenece, y si es sucursal de otra organización.

No se portan las de GeoReporta (GAD de Quito, Guayaquil, Cuenca, Ambato y Loja)
— son datos de su despliegue, no del nuestro.

Bloquea: T7.9.C1 → T7.9.C4
Owner: Andy / operador
```

---

## Orden de ejecución sugerido

```
T7.1 (tooling)  →  T7.5 (ruteo)  →  T7.2 → T7.3 → T7.4 → T7.6 → T7.7 → T7.8 → T7.9
```

T7.5 va segundo, no quinto: es el único defecto de comportamiento y la Fase 7 de
frontend va a consumir `notified-for`. Construir UI contra la semántica equivocada
es donde el costo se multiplica.

Dependencias duras entre migraciones (no reordenar la numeración):
`0031 → 0036`, `0033 → 0037`, `0035 → 0037`, `0034 → 0039`, `0036 → 0038`.
