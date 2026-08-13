# 🚀 Quick Reference: Adaptation Tasks

**Distribución rápida de tareas entre compañeros**

---

## 👤 COMPAÑERO 1: Backend Developer

**Responsable de:** T1, T5, T8 (parcial)

### Tareas
1. **T1: NestJS Modules** (2 sem) — Controllers, Services, Entities
   - Incidents, Comments, Assignments, Notifications, Auth, Geofencing, WebSockets, Rate Limiter
   
2. **T5: Jest Backend Tests** (1 sem) — Unit + Integration tests
   - Services, Controllers, Auth, Integración DB
   
3. **T8: Docker Compose** (1 sem, con DevOps) — Backend container

### Stack
- Node.js + NestJS + TypeScript
- PostgreSQL + PostGIS
- Redis
- Socket.io (WebSockets)
- Jest + Supertest

### Referencia
Adaptar `GeoReporta/backend/app/Domains/` → `backend/src/modules/`

---

## 👤 COMPAÑERO 2: Frontend Developer

**Responsable de:** T2, T4, T6, T7 (parcial)

### Tareas
1. **T2: Angular Services** (2 sem) — HTTP, Auth, Incidents, Comments, Maps
   - Interceptores, Guards, Models

2. **T4: Offline-First** (1.5 sem) — IndexedDB + Sync
   - Queue de reportes, Sincronización automática, Compression

3. **T6: Jest Frontend Tests** (1 sem) — Unit tests Angular
   - Services, Components, Offline-Sync

4. **T7: E2E Tests** (1.5 sem, con QA) — Playwright scenarios
   - Citizen report flow, Admin dashboard, Offline simulation, PWA mobile

### Stack
- Angular v17+
- TypeScript + RxJS
- Tailwind CSS
- Leaflet.js
- IndexedDB
- Canvas API (compresión)
- Jest + Jasmine + Karma
- Playwright

### Referencia
Adaptar `GeoReporta/frontend/app/` → `frontend/src/app/`

---

## 👤 COMPAÑERO 3: DB/DevOps

**Responsable de:** T3, T8

### Tareas
1. **T3: Database Schema** (1 sem) — PostgreSQL + PostGIS
   - Tablas, Migrations, Índices, Constraints, Seed data
   - Geofencing validation con PostGIS

2. **T8: Docker + CI/CD** (1 sem) — Containerización + GitHub Actions
   - Dockerfiles, docker-compose.yml, GitHub Actions pipeline
   - Infraestructura local y CI/CD

### Stack
- PostgreSQL 16 + PostGIS 3.4
- Redis
- Docker + Docker Compose
- GitHub Actions
- TypeORM / Prisma (Migrations)

### Referencia
Schema inspired by `GeoReporta` pero con PostGIS para geofencing

---

## ⏱️ Timeline

```
Semana 1-2:  T3 (DB) + T1.1-T1.4 (Backend) + T2.1-T2.3 (Frontend)
Semana 3-4:  T1.5-T1.8 (Backend) + T2.4-T2.8 (Frontend)
Semana 5:    T4 (Offline) + T5 (Jest Backend)
Semana 6:    T6 (Jest Frontend) + T7 (Playwright)
Semana 7:    T8 (Docker/CI) + Buffer para problemas
Semana 8:    Integration testing + Deploy
```

---

## 📊 Matriz de Dependencias

```
T3 (DB Schema)
  ↓
T1 (Backend) ← usa DB
  ↓
T2 (Frontend Services) ← consumen API Backend
  ↓
T4 (Offline) ← usa Frontend Services
  ↓
T5 (Backend Tests)
T6 (Frontend Tests)
  ↓
T7 (E2E Tests) ← integración completa
  ↓
T8 (Docker/CI)
```

---

## 🎯 Milestones

### ✅ Hito 1: Backend + DB (Fin Semana 4)
- API funcionando (CRUD básico)
- Tests unitarios
- Database con PostGIS

### ✅ Hito 2: Frontend Core (Fin Semana 5)
- Servicios Angular
- Componentes básicos
- Offline-First funcionando

### ✅ Hito 3: Testing Complete (Fin Semana 6)
- Coverage ≥ 70%
- E2E tests pasando
- PWA installable

### ✅ Hito 4: Deployment Ready (Fin Semana 8)
- Docker compose working
- CI/CD pipeline
- Documentación completa

---

## 📋 Checklist Por Compañero

### Backend Dev
- [ ] NestJS modules compilando
- [ ] API endpoints testeados
- [ ] JWT/Auth flow funcionando
- [ ] WebSockets broadcasting
- [ ] Rate limiter activo
- [ ] 80%+ coverage tests

### Frontend Dev
- [ ] Servicios Angular consumiendo API
- [ ] Componentes renderizando datos
- [ ] IndexedDB queue funcionando
- [ ] Offline sync testeado
- [ ] PWA installable
- [ ] 70%+ coverage tests
- [ ] E2E scenarios pasando

### DevOps
- [ ] Schema PostgreSQL + PostGIS
- [ ] Docker Compose levantando 4 servicios
- [ ] GitHub Actions ejecutando linters + tests
- [ ] Documentación SETUP actualizada

---

## 🆘 Soporte Técnico

**Bloqueador en Backend?** → DevOps + Backend Dev  
**Bloqueador en Frontend?** → Backend + Frontend Dev  
**Bloqueador en DB?** → DevOps + Backend Dev

Slack: Tag `@transito-alerta-team` + descripción + screenshot

---

**Created:** 2026-08-13  
**Status:** READY TO DISTRIBUTE
