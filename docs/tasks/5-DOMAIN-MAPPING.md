# 5: Mapeo de Dominios — GeoReporta (15) → Transito-Alerta-SE (16)

## Estado de Portación por Dominio

| # | Dominio GeoReporta | Módulo NestJS | Estado | LOC Est. | Notas |
|---|---|---|---|---|---|
| 1 | Auth (JWT + Firebase) | AuthModule | ✅ 100% | 350 | Device UUID + JWT (Firebase eliminada), T1.4 |
| 2 | Incidents | IncidentsModule | ✅ 100% | 400 | Geofencing PostGIS, slice de calibración, T2.1 |
| 3 | Comments | CommentsModule | ✅ 100% | 200 | Anidados, escape XSS, T2.2 |
| 4 | Users | UsersModule | ✅ 100% | 250 | Perfil + avatares S3, T2.3 |
| 5 | Assignments | AssignmentsModule | ✅ 100% | 220 | Detección de conflicto (double-claim), T2.4 |
| 6 | Realtime | RealtimeModule | ✅ 100% | 300 | Socket.io + consumer grupo Redis Streams, T2.5 |
| 7 | Roles | RolesModule | ✅ 100% | 150 | Entidad RBAC, asignación desnormalizada, T3.1 |
| 8 | Permissions | PermissionsModule | ✅ 100% | 100 | Catálogo (informacional), guard via strings planos, T3.1 |
| 9 | Menus | MenusModule | ✅ 100% | 100 | Nav filtrada por rol, mapa estático, T3.10 |
| 10 | Organizations | OrganizationsModule | 🟡 40% | 180 | Aislamiento scoped por zona, T3.2 (en progreso) |
| 11 | Notifications | NotificationsModule | 🟡 20% | 280 | Entrega async (Email/Telegram), T3.3 (bloqueada en T3.5) |
| 12 | Mail | MailModule | ✅ 100% | 200 | SMTP + Redis Streams outbox, T3.5 (completada) |
| 13 | StatusHistory | StatusHistoryModule | 🟡 30% | 120 | Auditoría solo-append, T3.4 (en progreso) |
| 14 | IncidentCategories | CategoriesModule | 🟡 20% | 100 | Árbol adjacency-list, T3.7 (en progreso) |
| 15 | Locations | LocationsModule | 🟡 30% | 80 | Geo zones CRUD + purga de caché, T3.8 (en progreso) |
| — | Sessions | SessionsModule | 🟡 40% | 100 | Rastreo JWT + revocación, T3.9 (en progreso) |

**Total**: 16 módulos, ~3,100 LOC (backend) + 150 LOC pruebas por módulo promedio

## Dependencias de Módulos (DAG)

```
AuthModule ─┬─→ UsersModule ──┬─→ OrganizationsModule
            │                 │
            ├─→ RolesModule ───┤─→ NotificationsModule (depende MailModule)
            │    │             │
            │    └─→ PermissionsModule  └─→ MailModule
            │         │                      │
            └─→ SessionsModule              └─→ InvitationsModule
                                            └─→ MailModule (directo)

IncidentsModule ──┬─→ CommentsModule ────────┬─→ StatusHistoryModule
                  │                          │
                  ├─→ AssignmentsModule ─┐   └─→ NotificationsModule
                  │                      │
                  ├─→ GeofencingModule ───┤─→ LocationsModule (CRUD)
                  │                      │
                  └─→ CategoriesModule ──┘

RealtimeModule ──→ IncidentsModule (consume stream)
                ↘ CommentsModule (consume stream)
                ↘ AssignmentsModule (consume stream)
                ↘ StatusHistoryModule (consume stream)

MenusModule ──→ AuthModule + RolesModule (búsqueda de permisos)
```

## Diferencias Clave vs GeoReporta

### GeoReporta (Laravel)
- Firebase OAuth para multi-tenancy
- 72 migraciones (huella de auditoría grande)
- ORM Eloquent con extensiones espaciales
- Trabajos Queue (Redis Resque)
- SSE para notificaciones en tiempo real

### Transito-Alerta-SE (NestJS)
- Device UUID + JWT (más simple, sin complejidad OAuth)
- ~20 migraciones (consolidadas, enfocadas en dominios)
- TypeORM + SQL PostGIS crudo (geofencing explícito)
- Consumer grupo Redis Streams (exactly-once, duradero)
- Socket.io para tiempo real (multi-dimensional room scoping)

## Orden de Implementación

### Camino Crítico Secuencial
1. **AuthModule** (T1.4) → desbloquea todos los demás dominios
2. **IncidentsModule** (T2.1) → dominio principal, valida slice de calibración
3. **RolesModule** (T3.1) → gates aplicación RBAC en todos los módulos
4. **MailModule** (T3.5) → desbloquea NotificationsModule + InvitationsModule

### Paralelizable Después del Camino Crítico
- **Fase 2**: {CommentsModule, UsersModule, AssignmentsModule, RealtimeModule} pueden ejecutarse en paralelo una vez que T2.1 aterriza
- **Fase 3**: {OrganizationsModule, StatusHistoryModule, CategoriesModule, LocationsModule, SessionsModule} pueden ejecutarse en paralelo una vez que T3.1 aterriza
- **Bloqueado**: NotificationsModule + InvitationsModule esperan T3.5 MailModule

## Criterios de Éxito

- [ ] Todos los 16 módulos tienen suites jest de prueba (70%+ cobertura)
- [ ] Ningún módulo importa de dominios no relacionados (patrón D7 passive-listener verificado)
- [ ] Todas las entidades TypeORM mapeadas al esquema de BD (migraciones 0001-0016)
- [ ] Flujos E2E abarcan múltiples módulos (creación de incident → asignación → notificación)
- [ ] Load test: 25k usuarios concurrentes en todos los módulos (p95 < 200ms)
