# Plan Maestro de Migración: GeoReporta → Transito-Alerta-SE

## Resumen Ejecutivo

Este documento proporciona un plan por fases para migrar un sistema completo de gestión de incidentes de Laravel (GeoReporta) a NestJS (Transito-Alerta-SE). La migración abarca la portación de módulos backend, alineación de esquema de base de datos, decisión de estrategia frontend, construcción de harness de pruebas y patrones de implementación en producción. Esfuerzo total: ~12 semanas para un equipo de 3 personas (1 líder backend, 1 líder frontend, 1 DevOps/QA).

## Cronograma de un Vistazo

| Fase | Componente | Estado | ETA | Duración |
|-------|-----------|--------|-----|----------|
| **Fase 1** | Infra Backend + Auth | ✅ Completada | 2026-08-15 | 1 semana |
| **Fase 2** | Dominios Principales (Incidents, Comments, Users, Assignments, Realtime) | ✅ Completada | 2026-08-22 | 1.5 semanas |
| **Fase 3** | Escala + RBAC (Roles, Permissions, Orgs, Notifications, Mail, etc.) | 🟡 En Progreso | 2026-09-05 | 2 semanas |
| **Fase 4** | E2E Testing + Load Testing + Security | ⏳ Planeada | 2026-09-19 | 1.5 semanas |
| **Fase 5** | Decisión Estrategia Frontend + Implementación | ⏳ Planeada | 2026-10-03 | 3 semanas |
| **Fase 6** | Testing de Integración + Cutover | ⏳ Planeada | 2026-10-24 | 2 semanas |
| **Fase 7** | Validación de Performance + Hardening | ⏳ Planeada | 2026-11-07 | 1.5 semanas |
| **Fase 8** | Rollout en Producción + Monitoreo | ⏳ Planeada | 2026-11-21 | 1 semana |

## Relación Entre Fases

```
Fase 1 (Infra) ──┐
                  ├─→ Fase 2 (Dominios Principales) ──┐
Fase 3 (RBAC) ─→┤                              ├─→ Fase 4 (Testing) ──┐
                  │                              │                      │
Fase 5 (Frontend)┴──────────────────────────────┼─→ Fase 6 (Integración)──┐
                                                 │                          │
                                                 └─→ Fase 7 (Performance)─────────┤
                                                                            │
                                                      Fase 8 (Rollout) ←───┘
```

## Camino Crítico

**Preparación Backend** (Fase 1-4): Debe completarse antes de que el frontend pueda probar completamente contra la nueva API. Bloqueos actuales: módulos restantes de Fase 3 (8 tareas, ~2 semanas).

**Estrategia Frontend** (Fase 5): Paralelo con testing de Fase 4 del backend para evitar retrasos. Árbol de decisiones: (1) Mantener Vanilla JS + Vite (riesgo más bajo, más rápido) → reconfigurar llamadas HTTP a API NestJS; (2) Migrar a Vue 3 (riesgo moderado, DX moderno) → migración incremental de componentes; (3) Migrar a React (riesgo más alto, mayor esfuerzo) — se recomienda **Opción 1 (Actualizado: Opción 3 es Angular v17+ PWA)**.

**Cutover Base de Datos** (Fase 6): Ocurre una vez que las migraciones de Fase 3 se aplican a producción. Base de datos única (Supabase) → complejidad de cutover mínima.

## Flujos de Trabajo Paralelos

- Las fases backend 1-3 se ejecutan secuencialmente (cadena de dependencias: auth → incidents → assignments/comments)
- {T2.2, T2.3, T2.4, T2.5} de Fase 2 pueden ejecutarse en paralelo una vez que T2.1 se complete
- Los módulos {T3.2-T3.9} de Fase 3 se ejecutan en paralelo una vez que T3.1 se complete
- Las pruebas de Fase 4 se ejecutan en paralelo al final de Fase 3
- Frontend (Fase 5) puede comenzar una vez que el backend de Fase 2 sea estable (~semana 3)

## Estado de Portación de Dominios

| Dominio | GeoReporta (Laravel) | Transito-Alerta-SE (NestJS) | Estado | Líder del Módulo |
|--------|----------------------|----------------------------|--------|------------|
| Auth | ✅ JWT + Firebase | ✅ JWT + Device UUID (D1) | Completada | @líder-backend |
| Incidents | ✅ Modelo Laravel | ✅ Servicio NestJS + PostGIS | Completada | @líder-backend |
| Comments | ✅ Modelo Laravel | ✅ Servicio NestJS + Sanitización | Completada | @líder-backend |
| Users | ✅ Modelo Laravel | ✅ Servicio NestJS + Avatar S3 | Completada | @líder-backend |
| Assignments | ✅ Modelo Laravel | ✅ Servicio NestJS + Verificación de Conflicto | Completada | @líder-backend |
| Realtime | ✅ WebSocket (básico) | ✅ Socket.io + Redis Adapter | Completada | @líder-backend |
| Roles | ✅ Modelo Eloquent | ✅ Servicio NestJS (T3.1) | ✅ Completada | @líder-backend |
| Permissions | ✅ Modelo Eloquent | ✅ Servicio NestJS (T3.1) | ✅ Completada | @líder-backend |
| Menus | ✅ Modelo Eloquent | ✅ Servicio NestJS (T3.10) | ✅ Completada | @líder-backend |
| **Organizations** | ✅ Modelo Eloquent | 🟡 T3.2 (En Progreso) | En Progreso | @líder-backend |
| **Notifications** | ✅ Modelo Eloquent | 🟡 T3.3 (Depende de Mail) | Bloqueada | @líder-backend |
| **Mail** | ✅ Laravel Mailable | ✅ T3.5 (Completada) | Completada | @líder-backend |
| **StatusHistory** | ✅ Modelo Eloquent | 🟡 T3.4 (En Progreso) | En Progreso | @líder-backend |
| **IncidentCategories** | ✅ Árbol Adjacency-List | 🟡 T3.7 (En Progreso) | En Progreso | @líder-backend |
| **Locations** | ✅ CRUD Geo Zones | 🟡 T3.8 (En Progreso) | En Progreso | @líder-backend |
| **Invitations** | ✅ Magic Link + OTP | 🟡 T3.6 (Depende de Mail) | Bloqueada | @líder-backend |
| **Sessions** | ✅ Seguimiento JWT | 🟡 T3.9 (En Progreso) | En Progreso | @líder-backend |

## Hoja de Ruta de Migración de Base de Datos

**Aplicadas** (0001-0008): ✅ Esquema principal, PostGIS, Users, Incidents, Comments, Assignments, Techo Anónimo  
**Pendientes** (0009-0010): Roles+Permissions, User Email  
**Migraciones Fase 3** (0011-0016): IncidentCategories, Invitations, StatusHistory, Locations (trigger CRUD geo_zones), Sessions, Mail  

Las 72 migraciones de GeoReporta deben auditarse y reescribirse como SQL o reutilizarse. Ver **3-DATABASE-SCHEMA.md**.

## Decisiones Clave

1. **Modelo de Identidad** (Diseño D1): Una fila `users` por entidad (dispositivo anón + cuenta combinada) → simplifica FK en 16 dominios.
2. **Caché de Permisos** (Diseño D2): Redis `perm:{user_id}` con bump `pv` para revocación — la vida útil del token de 15m permanece, pero los cambios de permisos se aplican instantáneamente mediante invalidación de caché.
3. **Geofencing** (Diseño D4): Tabla materializada `geo_zones` + `ST_Contains` en tiempo de escritura + lecturas de proximidad en caché. Clave de caché: `geo:{zone_id}:{lat3}:{lng3}:{radius}:{status}`.
4. **Event Stream** (Diseño D5): Redis Streams (registro duradero) + socket.io-redis-adapter (fanout entre instancias). Ambos requeridos, ninguno por sí solo suficiente.
5. **Salas en Tiempo Real** (Diseño D6): Puertas de permisos al unirse, multidimensional (geo, org, incident, user) — limita fanout a 25k usuarios.

## Estrategia Frontend: Camino Recomendado

**Opción 1: Mantener Vanilla JS + Vite (ANTERIOR - NO RECOMENDADO)** 
- Riesgo: Bajo | Esfuerzo: 4 semanas | Beneficio: Entrega más rápida, reentrenamiento mínimo
- Acción: Reconfigurar todas las llamadas `fetch()` de API Laravel a rutas NestJS `/api/v1/`
- Mantenimiento: Vanilla JS escala a ~10k LOC; más allá de eso, refactorizar a Vue 3
- Cronograma: Paralelo a Fase 4 (semanas 5-6), iniciar Fase 5 semana 4

**Opción 2: Migrar a Vue 3 (ANTERIOR - MODERADO)**
- Riesgo: Moderado | Esfuerzo: 8 semanas | Beneficio: DX moderno, seguridad de tipos (TS), migración gradual
- Acción: Extraer servicios Vanilla JS → composables Vue 3; reescribir vistas incrementalmente
- Mantenimiento: Vue DevTools, mejor aislamiento de componentes, SSR-ready
- Cronograma: Entrega retrasada; se recomienda post-Fase 6

**Opción 3: Migrar a Angular v17+ PWA (RECOMENDADO AHORA)** 
- Riesgo: Bajo-Moderado | Esfuerzo: 3 semanas | Beneficio: Arquitectura empresarial, type safety, PWA built-in, offline-first
- Acción: Scaffold Angular 17+, servicios principales (Auth, Geolocation, IndexedDB), componentes (Report, Dashboard), Socket.io real-time
- Mantenimiento: Componentes standalone, RxJS Observables, Tailwind CSS, @angular/pwa para Service Worker automático
- Cronograma: Fases 5A-5C (semanas 4-7), entrega en semana 7 (+1 week aceptable, aún dentro de ventana 12-semanas)

## Resumen de Estrategia de Testing

- **Unit Tests**: Jest (módulos backend), Vitest (servicios frontend) — 70%+ cobertura por módulo
- **E2E**: Testcontainers (postgis:16-3.4 + redis:7) — 4 escenarios de workflow (report → assign → comment → resolved)
- **Load Testing**: k6 o Artillery — 25k usuarios concurrentes, objetivo 5k sockets/instancia
- **Security**: Regresión SQL injection, validación CORS, rate limiting por device_uuid

## Modelo de Despliegue

**Desarrollo**: Docker Compose (postgres:postgis + redis) — igual que Supabase/Redis en producción  
**Producción**: Supabase Administrada (PostgreSQL 16 + PostGIS 3.4) + Redis Administrada (AWS/Upstash)  
**CI/CD**: GitHub Actions (backend test + migration lint, frontend lint + e2e)  
**Estrategia de Rollout**: Blue-Green (ambas pilas ejecutándose en paralelo) o Canary (10% tráfico a v2 durante 24h)

## Preguntas Abiertas y Bloqueos

| Pregunta | Estado | ¿Bloqueador? | Mitigación |
|----------|--------|----------|-----------|
| ¿Firebase multi-auth mantener o eliminar? | Decidido: ELIMINAR | No | D1 maneja anón como identidad de bajo permiso |
| ¿Supabase PostGIS + privilegios GIST? | Verificado ✅ | No | Extensión habilitada, geofencing funciona |
| ¿Fuente de geo_zones Santa Elena (GeoJSON/shp)? | Encontrada ✅ | No | ecuador-locations-geom.json en GeoReporta |
| ¿Acciones exactas del techo de permiso anónimo? | Bloqueada ✅ | No | {READ incidents, CREATE incidents, CREATE comments} per blocker resolution #4 |
| ¿72 migraciones de GeoReporta: bulk-port o auditar cada una? | Auditar cada una | No | Plan: samplear 10, extrapolar patrones SQL, verificación spot de 5 aleatorios |

## Criterios de Éxito (PUNTOS DE CONTROL)

- [ ] Los 16 módulos backend desplegados a staging
- [ ] 4/4 escenarios de flujo E2E pasando (Testcontainers)
- [ ] Cutover de BD probado: Laravel antiguo ↔ NestJS nuevo ambos leen/escriben en BD compartida
- [ ] Reconfiguración de servicio frontend completada: todas las llamadas HTTP ✅ apuntando a `/api/v1/`
- [ ] Load test: 25k usuarios concurrentes, latencia p95 < 200ms, cero conexiones perdidas
- [ ] Seguridad: rate limiting, CORS, regresión SQL injection todos ✅
- [ ] Documentación: README, contrato API, runbook de despliegue listos
- [ ] Cutover en producción: despliegue Blue-Green, 0 tiempo inactivo, plan de rollback probado

## Siguientes Pasos

1. **Semana 1 (Ahora)**: Finalizar backend Fase 3 (T3.2-T3.10) — 8 tareas, ~2 semanas restantes
2. **Semana 2-3**: Harness de testing E2E Fase 4 (T4.1a completada, T4.1b en progreso al completar Fase 3)
3. **Semana 3-4**: Revisión de estrategia frontend (alineación de equipo en recomendación de Opción 3 - Angular v17+ PWA)
4. **Semana 4-5**: Reconfiguración frontend (si Opción 1) o inicio de migración (si Opción 2/3)
5. **Semana 5-6**: Testing de integración + validación de procedimiento de cutover
6. **Semana 6-7**: Load testing + hardening
7. **Semana 7-8**: Rollout en producción + monitoreo 48h
