# 🔄 Tareas de Adaptación: GeoReporta → Transito-Alerta-SE

**Objetivo:** Adaptar patrones arquitectónicos de GeoReporta (Laravel + Vanilla JS) a tu stack (Angular + NestJS).

**Duración estimada:** 8 semanas  
**Equipo:** 3-4 compañeros (Frontend, Backend, DB/DevOps, QA)

---

## 📋 Matriz de Responsabilidades

| Tarea | Responsable | Duración | Estado |
|-------|------------|----------|--------|
| **T1** Backend NestJS Modules | Backend Dev | 2 sem | ⏳ TODO |
| **T2** Frontend Angular Services | Frontend Dev | 2 sem | ⏳ TODO |
| **T3** Database Schema + PostGIS | DB/DevOps | 1 sem | ⏳ TODO |
| **T4** Offline-First (IndexedDB) | Frontend Dev | 1.5 sem | ⏳ TODO |
| **T5** Testing: Backend Jest | Backend Dev | 1 sem | ⏳ TODO |
| **T6** Testing: Frontend Jest/Karma | Frontend Dev | 1 sem | ⏳ TODO |
| **T7** E2E Tests (Playwright/Cypress) | QA | 1.5 sem | ⏳ TODO |
| **T8** Docker + CI/CD Setup | DB/DevOps | 1 sem | ⏳ TODO |

---

## 🎯 TAREA T1: Backend NestJS Modules

**Responsable:** Backend Developer  
**Duración:** 2 semanas  
**Prioridad:** CRÍTICA

### Descripción
Adaptar las Controllers y Services de GeoReporta (Laravel) a módulos NestJS con TypeScript. Mantener la lógica de negocio igual, solo cambiar implementación.

### Referencia GeoReporta
```
backend/app/Domains/
  ├── Incidents/
  │   ├── Http/Controllers/IncidentController.php
  │   ├── Http/Controllers/AssignmentController.php
  │   └── Services/
  ├── Comments/
  │   ├── Http/Controllers/CommentController.php
  │   └── Services/
  ├── Auth/
  ├── Notifications/
  └── Locations/
```

### Sub-tareas

#### T1.1: Incidents Module
- [ ] Crear `backend/src/modules/incidents/incidents.module.ts`
- [ ] Crear `backend/src/modules/incidents/incidents.controller.ts`
  - `POST /incidents` (crear reporte)
  - `GET /incidents/:id` (obtener detalle)
  - `PATCH /incidents/:id` (actualizar estado)
  - `GET /incidents` (listar con filtros)
- [ ] Crear `backend/src/modules/incidents/incidents.service.ts`
  - Lógica de validación geográfica (PostGIS)
  - Rate limiting (Redis)
  - Almacenamiento foto (Supabase/S3)
- [ ] Crear `backend/src/modules/incidents/entities/incident.entity.ts`
  - Fields: id, title, description, latitude, longitude, status, priority, created_at
  - Usar TypeORM/Prisma
- [ ] Crear `backend/src/modules/incidents/dto/`
  - `create-incident.dto.ts` (validación)
  - `update-incident.dto.ts`
  - `incident.response.dto.ts`

**Reference GeoReporta:**
```php
// app/Domains/Incidents/Http/Controllers/IncidentController.php
public function store(StoreIncidentRequest $request)
{
    return $this->service->createIncident($request->validated());
}
```

#### T1.2: Comments Module
- [ ] Crear `backend/src/modules/comments/comments.module.ts`
- [ ] Crear `backend/src/modules/comments/comments.controller.ts`
  - `POST /incidents/:id/comments` (crear comentario)
  - `GET /incidents/:id/comments` (listar anidados)
  - `DELETE /comments/:id` (eliminar)
- [ ] Crear `backend/src/modules/comments/comments.service.ts`
  - Validación de permisos (usuario propietario)
  - Emit realtime event (WebSocket)
- [ ] Crear `backend/src/modules/comments/entities/comment.entity.ts`
  - Fields: id, incident_id, user_id, content, images[], created_at

#### T1.3: Assignments Module
- [ ] Crear `backend/src/modules/assignments/assignments.module.ts`
- [ ] Crear `backend/src/modules/assignments/assignments.controller.ts`
  - `POST /incidents/:id/assign` (asignar responsable)
  - `GET /incidents/:id/assignments` (listar responsables)
- [ ] Crear `backend/src/modules/assignments/assignments.service.ts`
  - Validar permisos (solo admin/operador)
  - Emit notification event

#### T1.4: Notifications Module
- [ ] Crear `backend/src/modules/notifications/notifications.module.ts`
- [ ] Crear `backend/src/modules/notifications/notifications.controller.ts`
  - `GET /notifications` (listar del usuario actual)
  - `PATCH /notifications/:id/read` (marcar como leído)
- [ ] Crear `backend/src/modules/notifications/notifications.service.ts`
  - Escuchar eventos (incident.created, status.changed, etc)
  - Enviar a Telegram si prioridad ALTA
  - Enviar Web Push

#### T1.5: Auth Module (Supabase)
- [ ] Crear `backend/src/modules/auth/auth.controller.ts`
  - `POST /auth/login`
  - `POST /auth/refresh`
  - `POST /auth/logout`
- [ ] Crear `backend/src/modules/auth/auth.guard.ts`
  - Validar JWT de Supabase
  - Extraer device_uuid
- [ ] Integrar Supabase SDK en `backend/src/config/supabase.config.ts`

#### T1.6: Geofencing Module
- [ ] Crear `backend/src/modules/geofencing/geofencing.service.ts`
- [ ] Implementar validación PostGIS
  ```sql
  -- Validar punto dentro de Santa Elena
  SELECT ST_Contains(
    ST_GeomFromText('POLYGON(...)'),
    ST_Point(lat, lng, 4326)
  )
  ```
- [ ] Crear guard `geofencing.guard.ts` (rechazar reportes fuera de jurisdicción)

#### T1.7: WebSockets Gateway
- [ ] Crear `backend/src/modules/websockets/incidents.gateway.ts`
  - Escuchar eventos de cambio de estado
  - Emitir a clientes suscritos: `incident:created`, `incident:updated`
  - Usar `@nestjs/websockets` + Socket.io

#### T1.8: Rate Limiter (Redis)
- [ ] Crear `backend/src/common/guards/rate-limiter.guard.ts`
- [ ] Implementar: máx 3 reportes cada 10 minutos por device_uuid
- [ ] Usar `@nestjs/cache-manager` con Redis backend

**Entregables:**
- [ ] Todos los módulos creados y testables
- [ ] Rutas funcionales (sin E2E aún)
- [ ] Documentación de endpoints en comentarios

---

## 🎯 TAREA T2: Frontend Angular Services

**Responsable:** Frontend Developer  
**Duración:** 2 semanas  
**Prioridad:** CRÍTICA

### Descripción
Crear servicios Angular que consumen API NestJS. Mantener estructura modular, usar RxJS observables.

### Referencia GeoReporta
```
frontend/app/
  ├── core/services/
  │   ├── incident.service.js
  │   ├── comment.service.js
  │   ├── auth.service.js
  └── shared/
```

### Sub-tareas

#### T2.1: HTTP Client Setup
- [ ] Crear `frontend/src/app/core/services/http.service.ts`
  - Wrapper alrededor HttpClient
  - Base URL = `http://localhost:3001/api`
- [ ] Crear `frontend/src/app/core/interceptors/auth.interceptor.ts`
  - Adjuntar JWT token en headers
  - Manejar 401 (refresh token)
- [ ] Crear `frontend/src/app/core/interceptors/error.interceptor.ts`
  - Log errores a Sentry
  - Mostrar toast al usuario

#### T2.2: Incident Service
- [ ] Crear `frontend/src/app/core/services/incident.service.ts`
  ```typescript
  export class IncidentService {
    getIncidents(filters?: any): Observable<Incident[]>
    getIncident(id: string): Observable<Incident>
    createIncident(data: CreateIncidentDto): Observable<Incident>
    updateIncidentStatus(id: string, status: string): Observable<Incident>
    deleteIncident(id: string): Observable<void>
  }
  ```
- [ ] Crear `frontend/src/app/models/incident.model.ts` (interfaces TypeScript)

#### T2.3: Comment Service
- [ ] Crear `frontend/src/app/core/services/comment.service.ts`
  ```typescript
  export class CommentService {
    getComments(incidentId: string): Observable<Comment[]>
    createComment(incidentId: string, data: CreateCommentDto): Observable<Comment>
    deleteComment(id: string): Observable<void>
  }
  ```

#### T2.4: Auth Service
- [ ] Crear `frontend/src/app/core/services/auth.service.ts`
  - Integrar con Supabase Auth
  - Guardar JWT en localStorage
  - Generar device_uuid en primera carga
  ```typescript
  export class AuthService {
    login(email: string, password: string): Observable<AuthResponse>
    logout(): Observable<void>
    getCurrentUser(): Observable<User>
    isAuthenticated(): boolean
    getDeviceUuid(): string
  }
  ```
- [ ] Crear `frontend/src/app/core/guards/auth.guard.ts`

#### T2.5: Geolocation Service
- [ ] Crear `frontend/src/app/core/services/geolocation.service.ts`
  - Usar HTML5 Geolocation API
  - Caché última ubicación (1 minuto)
  - Manejar errores (sin permiso, GPS desactivado)
  ```typescript
  export class GeolocationService {
    getCurrentLocation(): Observable<Coordinates>
    watchLocation(): Observable<Coordinates>
  }
  ```

#### T2.6: Image Compressor Service
- [ ] Crear `frontend/src/app/core/services/image-compressor.service.ts`
  - Canvas API para comprimir a WebP
  - Target: < 200KB
  - Inyectable en componentes
  ```typescript
  export class ImageCompressorService {
    compressImage(file: File, quality: number = 0.7): Promise<Blob>
  }
  ```

#### T2.7: Notification Service
- [ ] Crear `frontend/src/app/core/services/notification.service.ts`
  - GET /notifications
  - PATCH /notifications/:id/read
  - Usar realtime si disponible

#### T2.8: Map Service
- [ ] Crear `frontend/src/app/features/admin-dashboard/services/map.service.ts`
  - Integración Leaflet.js + Angular
  - Renderizar puntos de incidentes
  - Heat map por prioridad
  - Click en marcador → mostrar detalle

**Entregables:**
- [ ] Todos los servicios creados
- [ ] Modelos TypeScript definidos
- [ ] Interceptores configurados
- [ ] Componentes consumiendo servicios

---

## 🎯 TAREA T3: Database Schema + PostGIS

**Responsable:** DB/DevOps  
**Duración:** 1 semana  
**Prioridad:** CRÍTICA

### Descripción
Diseñar e implementar schema PostgreSQL con PostGIS, migraciones y índices.

### Referencia GeoReporta
```sql
-- GeoReporta usa MySQL/PostgreSQL con modelos Laravel
-- Adaptamos a PostgreSQL + PostGIS
```

### Sub-tareas

#### T3.1: PostgreSQL Setup
- [ ] Crear `backend/docker-compose.yml` con PostgreSQL 16 + PostGIS 3.4
- [ ] Extender PostgreSQL con: `CREATE EXTENSION postgis;`
- [ ] Crear base de datos: `transito_alerta_se`

#### T3.2: Core Tables (TypeORM/Prisma Migrations)
- [ ] Crear tabla `users`
  - id (UUID)
  - email (unique)
  - password_hash
  - role (citizen, operator, admin)
  - device_uuid (para tracking offline)
  - created_at, updated_at
- [ ] Crear tabla `incidents`
  - id (UUID)
  - title, description
  - geometry (PostGIS Point, SRID 4326)
  - status (pending, in_progress, resolved)
  - priority (low, medium, high)
  - citizen_id (FK → users)
  - created_at, updated_at, resolved_at
- [ ] Crear tabla `incident_categories`
  - id, name (accidente, semáforo, vía bloqueada, etc)
- [ ] Crear tabla `incident_has_categories`
  - incident_id, category_id (N:M)
- [ ] Crear tabla `comments`
  - id, content, incident_id (FK), user_id (FK)
  - created_at, updated_at
- [ ] Crear tabla `comment_images`
  - id, comment_id (FK), image_url, storage_key
- [ ] Crear tabla `assignments`
  - id, incident_id (FK), user_id (FK), role (primary, support)
  - created_at
- [ ] Crear tabla `notifications`
  - id, user_id (FK), type, related_incident_id (FK)
  - is_read, created_at
- [ ] Crear tabla `status_history`
  - id, incident_id (FK), old_status, new_status, user_id (FK), created_at

#### T3.3: PostGIS Indexes & Constraints
- [ ] Crear índice GiST en `incidents.geometry`
  ```sql
  CREATE INDEX idx_incidents_geom ON incidents USING GIST(geometry);
  ```
- [ ] Crear función de validación geofencing
  ```sql
  CREATE OR REPLACE FUNCTION validate_location_within_canton()
  RETURNS TRIGGER AS $$
  BEGIN
    IF NOT ST_Contains(
      ST_GeomFromText('POLYGON((-80.9 -2.1, -80.3 -2.1, -80.3 -1.7, -80.9 -1.7, -80.9 -2.1))', 4326),
      NEW.geometry
    ) THEN
      RAISE EXCEPTION 'Location outside Santa Elena canton';
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  ```
- [ ] Aplicar trigger a `incidents` table

#### T3.4: Data Integrity
- [ ] Foreign keys con ON DELETE CASCADE
- [ ] Constraints: email unique, status ENUM, priority ENUM
- [ ] Unique indices: (user_id, incident_id) en assignments

#### T3.5: Seed Data (Pruebas)
- [ ] Crear script `backend/seeds/seed.ts`
  - 5 usuarios (citizen, operator, admin)
  - 20 incidentes de prueba (dentro Santa Elena)
  - Categorías: accidente, semáforo, vía bloqueada, peligro

**Entregables:**
- [ ] Schema.sql documentado
- [ ] Migrations (TypeORM/Prisma)
- [ ] Queries optimizadas documentadas
- [ ] Docker Compose con PostgreSQL+PostGIS

---

## 🎯 TAREA T4: Offline-First (IndexedDB + Sync)

**Responsable:** Frontend Developer  
**Duración:** 1.5 semanas  
**Prioridad:** ALTA

### Descripción
Implementar queue de reportes offline usando IndexedDB. Sincronizar cuando hay conexión.

### Referencia
```
frontend/src/app/core/db/
  ├── indexed-db.service.ts (wrapper)
  └── offline-sync.service.ts (lógica de batch)
```

### Sub-tareas

#### T4.1: IndexedDB Schema
- [ ] Crear `frontend/src/app/core/db/indexed-db.service.ts`
  - Store: `pending_incidents`
  - Fields: id, title, description, lat, lng, photo (blob), status, created_at
  - Index: status, created_at
  ```typescript
  interface PendingIncident {
    id: string;
    title: string;
    description: string;
    lat: number;
    lng: number;
    photo?: Blob;
    imageUrl?: string;
    status: 'pending' | 'synced' | 'failed';
    attempts: number;
    createdAt: Date;
  }
  ```

#### T4.2: Offline Queue Service
- [ ] Crear `frontend/src/app/core/services/offline-sync.service.ts`
  ```typescript
  export class OfflineSyncService {
    // Guardar reporte en queue
    queueIncident(incident: CreateIncidentDto, photo?: File): Promise<void>
    
    // Sincronizar cuando hay conexión
    syncPendingIncidents(): Observable<SyncResult>
    
    // Obtener reportes pendientes
    getPendingIncidents(): Observable<PendingIncident[]>
    
    // Retry fallidos
    retryFailedSync(): Observable<void>
  }
  ```

#### T4.3: Connection Detection
- [ ] Crear servicio que monitoree conexión
  ```typescript
  export class ConnectionService {
    isOnline$: BehaviorSubject<boolean>
    
    // Escuchar cambios de conexión
    onOnlineChange(): Observable<boolean>
  }
  ```
- [ ] Cuando se detecte conexión → triggerear sync automático

#### T4.4: Conflict Resolution
- [ ] Si sincronización falla:
  - Reintentar 3 veces (exponential backoff)
  - Mostrar advertencia al usuario
  - Permitir editar antes de reintentar

#### T4.5: Photo Handling Offline
- [ ] Comprimir foto localmente (Canvas API)
- [ ] Guardar Blob en IndexedDB
- [ ] Mostrar preview local mientras se sincroniza
- [ ] Al sincronizar: subir a Storage (Supabase/S3)

**Entregables:**
- [ ] IndexedDB integrado
- [ ] Sync automático funcionando
- [ ] Tests unitarios para conflictos

---

## 🎯 TAREA T5: Testing Backend (Jest + Supertest)

**Responsable:** Backend Developer  
**Duración:** 1 semana  
**Prioridad:** MEDIA

### Descripción
Escribir tests unitarios e integración para módulos NestJS.

### Sub-tareas

#### T5.1: Setup Jest
- [ ] Configurar `backend/jest.config.js`
- [ ] Instalar: `@nestjs/testing`, `@types/jest`, `supertest`

#### T5.2: Unit Tests - Incidents
- [ ] `backend/src/modules/incidents/__tests__/incidents.service.spec.ts`
  - Test createIncident con geofencing válido
  - Test createIncident fuera de jurisdicción (debe fallar)
  - Test rate limiting (max 3 reportes/10min)
  - Test updateIncidentStatus (solo admin)
- [ ] `backend/src/modules/incidents/__tests__/incidents.controller.spec.ts`
  - Test POST /incidents (200 con body válido)
  - Test GET /incidents/:id (200 si existe, 404 si no)
  - Test autenticación requerida

#### T5.3: Unit Tests - Comments
- [ ] `backend/src/modules/comments/__tests__/comments.service.spec.ts`
  - Test crear comentario (solo usuario autenticado)
  - Test eliminar comentario (solo propietario o admin)
  - Test validación de incident_id

#### T5.4: Unit Tests - Auth
- [ ] `backend/src/modules/auth/__tests__/auth.service.spec.ts`
  - Test login con credenciales válidas
  - Test login con credenciales inválidas (401)
  - Test refresh token

#### T5.5: Integration Tests
- [ ] `backend/src/modules/incidents/__tests__/incidents.integration.spec.ts`
  - Test completo: POST /incidents → GET /incidents/:id
  - Test cambiar estado → verificar notification
  - Test comentario en incident → verificar broadcast websocket

**Entregables:**
- [ ] Coverage ≥ 80% en módulos principales
- [ ] CI integrado con GitHub Actions

---

## 🎯 TAREA T6: Testing Frontend (Jest/Karma + Jasmine)

**Responsable:** Frontend Developer  
**Duración:** 1 semana  
**Prioridad:** MEDIA

### Descripción
Tests unitarios para servicios y componentes Angular.

### Sub-tareas

#### T6.1: Setup Jest (Optional) o Karma
- [ ] Angular por defecto usa Karma + Jasmine
- [ ] Instalación: `ng test`

#### T6.2: Service Tests
- [ ] `frontend/src/app/core/services/__tests__/incident.service.spec.ts`
  - Mock HttpClient
  - Test getIncidents() retorna Observable<Incident[]>
  - Test createIncident() con validación DTO
  - Test error handling (404, 500)
- [ ] `frontend/src/app/core/services/__tests__/geolocation.service.spec.ts`
  - Mock navigator.geolocation
  - Test getCurrentLocation() retorna coordenadas
  - Test error si permiso denegado
- [ ] `frontend/src/app/core/services/__tests__/offline-sync.service.spec.ts`
  - Test queueIncident() guarda en IndexedDB
  - Test syncPendingIncidents() sincroniza

#### T6.3: Component Tests
- [ ] `frontend/src/app/features/citizen-report/citizen-report.component.spec.ts`
  - Test formulario validación
  - Test captura GPS
  - Test compresión imagen
  - Test envío/queue offline
- [ ] `frontend/src/app/features/admin-dashboard/admin-dashboard.component.spec.ts`
  - Test carga lista incidentes
  - Test filtros funcionan
  - Test cambio de estado

**Entregables:**
- [ ] Coverage ≥ 70% en servicios
- [ ] Tests ejecutables con `ng test`

---

## 🎯 TAREA T7: E2E Tests (Playwright / Cypress)

**Responsable:** QA / Frontend  
**Duración:** 1.5 semanas  
**Prioridad:** MEDIA

### Descripción
Tests end-to-end simulando flujos reales (incluyendo offline).

### Sub-tareas

#### T7.1: Setup Playwright
- [ ] Instalar: `npm install -D @playwright/test`
- [ ] Configurar `playwright.config.ts`
- [ ] Mobile device profile para testing PWA

#### T7.2: Citizen Report Flow
- [ ] `e2e/citizen-report.spec.ts`
  - Abrir PWA
  - Permitir geolocalización
  - Llenar formulario (título, descripción)
  - Capturar foto
  - Submit (si online → envío inmediato; si offline → queue)
  - Verificar éxito/toast

#### T7.3: Admin Dashboard Flow
- [ ] `e2e/admin-dashboard.spec.ts`
  - Login como operador
  - Ver lista incidentes
  - Filtrar por prioridad
  - Click en incidente → ver detalle y mapa
  - Cambiar estado → verificar actualización en tiempo real

#### T7.4: Offline Simulation
- [ ] `e2e/offline-flow.spec.ts`
  - Activar offline mode (DevTools o Playwright API)
  - Crear reporte
  - Verificar que entra en queue (IndexedDB)
  - Reactivar conexión
  - Verificar sync automático

#### T7.5: Mobile PWA Tests
- [ ] `e2e/mobile-pwa.spec.ts`
  - Usar Playwright mobile device
  - Instalar PWA ("Add to Home Screen")
  - Verificar manifest.webmanifest
  - Test funcionamiento offline en app

**Entregables:**
- [ ] Suite E2E ejecutable
- [ ] CI integrado (GitHub Actions)
- [ ] Reporte de resultados

---

## 🎯 TAREA T8: Docker + CI/CD Setup

**Responsable:** DB/DevOps  
**Duración:** 1 semana  
**Prioridad:** MEDIA

### Descripción
Containerizar aplicación y configurar pipeline de CI/CD.

### Sub-tareas

#### T8.1: Backend Dockerfile
- [ ] Crear `backend/Dockerfile`
  ```dockerfile
  FROM node:20-alpine
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci --only=production
  COPY . .
  RUN npm run build
  EXPOSE 3001
  CMD ["node", "dist/main.js"]
  ```
- [ ] Crear `.dockerignore`

#### T8.2: Frontend Dockerfile
- [ ] Crear `frontend/Dockerfile`
  ```dockerfile
  FROM node:20-alpine AS build
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci
  COPY . .
  RUN npm run build
  
  FROM nginx:alpine
  COPY --from=build /app/dist /usr/share/nginx/html
  COPY nginx.conf /etc/nginx/nginx.conf
  EXPOSE 80
  CMD ["nginx", "-g", "daemon off;"]
  ```

#### T8.3: Docker Compose (Full Stack)
- [ ] Crear `docker-compose.yml` con:
  - PostgreSQL 16 + PostGIS
  - Redis
  - NestJS API (puerto 3001)
  - Angular PWA (puerto 80)
- [ ] Crear `.env.example` con variables

#### T8.4: GitHub Actions CI/CD
- [ ] Crear `.github/workflows/ci.yml`
  - Run linters (ESLint, Prettier)
  - Run type check (TypeScript)
  - Run unit tests
  - Run E2E tests
  - Build Docker images
  - Push a registry (opcional)

#### T8.5: Local Dev Setup
- [ ] Crear `docs/SETUP.md`
  - Instrucciones clonar repo
  - `docker-compose up -d`
  - Verificar servicios
  - Acceder a PWA (http://localhost)

**Entregables:**
- [ ] Docker Compose funcional
- [ ] GitHub Actions pipeline
- [ ] Documentación SETUP

---

## ✅ Checklist Final

Antes de marcar como "Completo", verificar:

- [ ] Todos los módulos NestJS compilando sin errores
- [ ] Todos los servicios Angular testables
- [ ] Base de datos con schema completo y PostGIS funcionando
- [ ] Offline-First sincronizando correctamente
- [ ] Tests ejecutándose (coverage ≥ 70%)
- [ ] E2E tests pasando
- [ ] Docker Compose levantando toda la app
- [ ] CI/CD ejecutándose en GitHub Actions
- [ ] Documentación actualizada

---

## 📞 Comunicación del Equipo

**Daily Standup:** 15 min cada mañana  
**Weekly Sync:** Viernes 4pm (review de bloqueadores)  
**Slack Channel:** #transito-alerta-backend / #transito-alerta-frontend / #transito-alerta-devops

### Template de Update
```
✅ Completado esta semana:
- [Tarea]

🔄 En progreso:
- [Tarea]

🚧 Bloqueadores:
- [Descripción]

⏱️ ETA próxima entrega:
```

---

## 🔗 Referencias

- **GeoReporta Backend:** `/GeoReporta/backend/app/Domains/`
- **GeoReporta Frontend:** `/GeoReporta/frontend/app/`
- **Stack del Proyecto:** `docs/Stack-tecnológico.md`
- **README Principal:** `README.md`

---

**Última actualización:** 2026-08-13  
**Creado por:** Andy (Orchestrator)
