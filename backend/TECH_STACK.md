# 🔧 Backend — Stack Tecnológico

**Migración de GeoReporta (Laravel) → Transito-Alerta-SE (NestJS)**

---

## 📊 Comparativa: De Laravel a NestJS

| Aspecto | GeoReporta (Origen) | Transito-Alerta-SE (Destino) | Razón |
|--------|-------------------|--------------------------|-------|
| **Lenguaje** | PHP 8.2+ | TypeScript + Node.js 20 | Type safety, JavaScript ecosystem, unificado con frontend |
| **Framework** | Laravel 11 | NestJS v10+ | Modular, escalable, arquitectura de capas, middleware nativo |
| **Base de Datos** | PostgreSQL + Redis | PostgreSQL 16 + PostGIS 3.4 + Redis 7 | PostGIS para geofencing espacial, Redis para rate-limiting |
| **ORM** | Eloquent (Laravel) | TypeORM | TypeScript ORM, decorators, migraciones automáticas |
| **API Style** | REST (Laravel routes) | REST + WebSockets | Real-time alerts con Socket.io (@nestjs/websockets) |
| **Auth** | JWT + Firebase | JWT + Device UUID | Anónimo-first, identificación por dispositivo + token |
| **Rate Limiting** | Laravel rate limit | Redis-based guard | Millisecond control, geofencing en caché |
| **Testing** | PHPUnit + Pest | Jest + Supertest | Unit + Integration, 70%+ coverage requerido |
| **Deployment** | Docker + Nginx | Docker multi-stage + Docker Compose | Costo-eficiente, development ≈ production |

---

## 🛠️ Stack Detallado

### Core Framework
```json
{
  "name": "transito-alerta-api",
  "version": "1.0.0",
  "engine": "node >= 20.0.0",
  "main_dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/platform-express": "^10.0.0",
    "@nestjs/typeorm": "^10.0.0",
    "@nestjs/jwt": "^12.0.0",
    "@nestjs/passport": "^10.0.0",
    "@nestjs/websockets": "^10.0.0",
    "@nestjs/cache-manager": "^2.1.0",
    "@nestjs/axios": "^3.0.0",
    "typeorm": "^0.3.17",
    "class-validator": "^0.14.0",
    "class-transformer": "^0.5.1"
  }
}
```

### Librerías Clave

#### 🗄️ Persistencia & Cache
- **`typeorm`** — ORM TypeScript con soporte decorators, migraciones automáticas
- **`pg`** — Driver PostgreSQL nativo
- **`postgis`** — Extensión PostGIS para geofencing (ST_Contains, ST_DWithin)
- **`redis`** — Cliente Redis para caché y rate-limiting
- **`cache-manager`** — Abstracción caché (compatible Redis)

#### 🔐 Seguridad & Auth
- **`@nestjs/jwt`** — Generación y validación de JWT
- **`@nestjs/passport`** — Estrategias autenticación (JWT, local)
- **`passport-jwt`** — Estrategia JWT
- **`bcrypt`** — Hash de contraseñas (si aplica)

#### 🌐 Comunicación & Real-time
- **`@nestjs/websockets`** — WebSocket gateway con Socket.io
- **`socket.io`** — Transporte en tiempo real para alertas
- **`@nestjs/axios`** — Cliente HTTP (Telegram Bot API, webhooks)

#### 🧪 Testing & QA
- **`@nestjs/testing`** — Testing utilities de NestJS
- **`jest`** — Test framework
- **`supertest`** — HTTP assertions
- **`@types/jest`** — Tipos TypeScript

#### 📊 Observabilidad & Logging
- **`@sentry/node`** — Error tracking centralizado
- **`winston`** — Logger estructurado (opcional)

#### 🚀 DevOps & Build
- **`typescript`** — Compilación a JavaScript
- **`ts-loader`** — Webpack loader para TypeScript
- **`@types/node`** — Tipos Node.js

---

## 📁 Estructura de Módulos

```
backend/src/
├── config/                    # Configuración (env, database, cache)
├── modules/
│   ├── incidents/            # Reporte de incidencias (PostGIS geofencing)
│   │   ├── incident.controller.ts
│   │   ├── incident.service.ts
│   │   ├── incident.entity.ts
│   │   ├── dto/
│   │   └── __tests__/
│   ├── comments/             # Comentarios anidados
│   ├── assignments/          # Asignación de responsables
│   ├── auth/                 # JWT + Device UUID auth
│   ├── geofencing/           # Validación espacial (Santa Elena)
│   ├── websockets/           # Socket.io gateway (alertas en tiempo real)
│   ├── notifications/        # Telegram Bot API, Web Push
│   └── users/                # Perfiles y roles
├── common/
│   ├── guards/              # RateLimiterGuard, AuthGuard
│   ├── interceptors/        # Error handling, Sentry
│   ├── filters/             # Exception filters
│   ├── dto/                 # DTOs globales
│   └── types/               # Tipos TypeScript
└── main.ts                  # Bootstrap + API prefix
```

---

## 🔄 Migración desde GeoReporta

### ✅ Se Mantiene (Patrón Domain-Driven Design)
- Dominios: Incidents, Comments, Assignments, Users, Notifications
- Estados workflow e historial
- Roles y permisos
- Geofencing (mejorado con PostGIS)

### 🔄 Se Adapta
- **Controllers**: REST de Laravel → NestJS @Controller + @Get/@Post
- **Services**: Eloquent queries → TypeORM repositories
- **Middleware**: Laravel middleware → NestJS guards + interceptors
- **Validation**: Laravel Form Requests → class-validator + DTOs
- **Cache**: Laravel cache → Redis directo + cache-manager

### ❌ Se Remplaza
- PHP → TypeScript/Node.js
- Laravel routes → NestJS decorators
- Eloquent ORM → TypeORM
- Laravel testing → Jest + Supertest
- Artisan commands → Custom NestJS CLI

### 🆕 Se Agrega
- **WebSockets en tiempo real** (Socket.io)
- **PostGIS geofencing** (ST_Contains para validar jurisdicción)
- **Rate-limiting por device_uuid** (Redis en millisegundos)
- **Telegram Bot API** para escalación de alertas
- **Sentry** para error tracking centralizado

---

## 📋 Requisitos

| Requisito | Versión | Razón |
|-----------|---------|-------|
| Node.js | ≥ 20.0.0 | LTS, soporte TypeScript nativo |
| npm | ≥ 9.0 | Gestión de dependencias |
| PostgreSQL | 16+ | Extensión PostGIS 3.4 |
| Redis | 7+ | Caché distribuida, rate-limiting |
| Docker | 20.10+ | Containerización multi-stage |
| TypeScript | 5.0+ | Type safety en desarrollo |

---

## 🚀 Setup Inicial

```bash
# Crear proyecto NestJS
npx @nestjs/cli@latest new transito-alerta-api
cd transito-alerta-api

# Instalar dependencias core
npm install @nestjs/typeorm @nestjs/jwt @nestjs/websockets redis
npm install typeorm pg class-validator class-transformer
npm install -D jest @types/jest supertest @nestjs/testing

# Docker + Compose (PostgreSQL + Redis)
docker-compose up -d
```

---

## ✅ Acceptance Criteria

- [ ] NestJS v10+ bootstrapped con `app.setGlobalPrefix('api')`
- [ ] TypeORM conectado a PostgreSQL + PostGIS
- [ ] Redis conectado para caché
- [ ] Módulos principales creados (Incidents, Comments, Auth)
- [ ] Jest + Supertest configurados (70%+ coverage)
- [ ] Docker Compose con 4 servicios (DB, Redis, API, Frontend)
- [ ] GitHub Actions CI pipeline (lint, type-check, test, build)
- [ ] Sentry integrado para error tracking
- [ ] WebSocket gateway funcionando (Socket.io)

---

## 🔗 Referencias

- **NestJS Docs:** https://docs.nestjs.com/
- **TypeORM Docs:** https://typeorm.io/
- **PostGIS Documentation:** https://postgis.net/docs/
- **Socket.io:** https://socket.io/docs/v4/

---

**Nota:** Este backend **no es un 1-a-1 copy** de GeoReporta. Es una **re-arquitectura completa** aprovechando las mejores prácticas de NestJS, TypeScript y el ecosistema Node.js moderno, manteniendo la lógica de negocio y los dominios de GeoReporta.