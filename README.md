# 🚨 Tránsito Alerta SE — Sistema de Reporte Ciudadano de Incidencias Viales

**Tránsito Alerta SE** es una Aplicación Web Progresiva (PWA) *Offline-First* de código abierto para reporte georreferenciado e instantáneo de incidentes viales (accidentes, semáforos defectuosos, vías bloqueadas, peligros en calzada) en Santa Elena, Ecuador.

Combina tecnología moderna, mapas de libre uso y sincronización sin conexión para mejorar respuesta de organismos de tránsito.

---

## 🎯 Propósito

Santa Elena carece de herramienta centralizada. Incidentes se reportan por redes sociales o llamadas sin coordenadas exactas → triaje lento, asistencia retrasada.

**Solución:**
- **Captura rápida** (GPS < 30s, sin descargas AppStore)
- **Offline-First** (encolado local, sincronización automática al recuperar señal)
- **Admin Dashboard** (mapa de calor, prioridad, alertas sonoras, despacho eficiente)

---

## 🏗️ Stack Tecnológico

```
[ PWA Móvil — Angular ]
  ├── Geolocation API + Canvas compression (< 200 KB WebP)
  ├── Workbox + IndexedDB (offline queue)
  └── REST + WebSocket (sync + realtime)
         │
         ▼
[ Backend — NestJS + TypeORM ]
  ├── REST API (auth, incidents, users, audit)
  ├── WebSocket Gateway (realtime updates, Socket.IO)
  ├── Rate Limiting (per-user/IP)
  ├── JWT + bcrypt auth
  └── Email/Telegram notifications
         │
         ▼
[ Data Layer ]
  ├── PostgreSQL 16 + PostGIS (geospatial queries, GiST index)
  ├── Redis 7 (cache, streams, Socket.IO adapter)
  └── MinIO (object storage — dev only)
         │
         ▼
[ Infra ]
  └── Docker Compose (local) + Nginx reverse proxy
```

### Full Stack

| Layer | Tech | Purpose |
|-------|------|---------|
| **Frontend** | Angular 18, TypeScript, Bootstrap 5 | PWA UI, offline queue, geolocation |
| **Backend** | NestJS, TypeORM, class-validator | REST API, auth, realtime |
| **Data** | PostgreSQL 16, PostGIS 3.4 | Spatial queries, incidents |
| **Cache** | Redis 7 | Session cache, rate limit, Socket.IO adapter |
| **Storage** | MinIO (local) | Dev image uploads |
| **DevOps** | Docker, pnpm workspaces, GitHub Actions | Build, test, deploy |

---

## 📋 Requisitos

- **Node.js** 22.x (LTS)
- **pnpm** 11.x
- **Docker** + **Docker Compose** (para infra local)
- **Git**

---

## 🚀 Quickstart

### 1. Setup Local

```bash
# Clone + install deps
git clone <repo>
cd Transito-Alerta-SE
pnpm install

# Start infra (postgres, redis, minio)
docker compose up -d

# Run migrations
pnpm --filter backend run db:migrate

# Start backend (watch mode)
pnpm --filter backend run start:dev
# Escucha en http://localhost:3001/api

# En otra terminal: start frontend
pnpm --filter frontend run start
# Abre http://localhost:4200
```

### 2. Environment Setup

```bash
# Backend (required)
cp backend/.env.example backend/.env
# Edit: JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, POSTGRES_PASSWORD, etc.
```

### 3. Database Seed (Opcional)

```bash
pnpm --filter backend run db:seed
# Crea usuarios de prueba, permisos, departamentos, incident demo data
```

---

## 💻 Development

### Estructura

```
Transito-Alerta-SE/
├── backend/           # NestJS API
│   ├── src/
│   │   ├── modules/   # Auth, incidents, users, realtime, mail
│   │   ├── shared/    # Guards, interceptors, utilities
│   │   └── config/
│   ├── test/          # E2E tests
│   └── migrations/    # TypeORM migrations
├── frontend/          # Angular PWA
│   ├── src/app/       # Components, services, features
│   └── dist/          # Build output
├── database/          # SQL seeds, migrations SQL
└── docker/            # Custom Dockerfiles
```

### Comandos Útiles

```bash
# Tests (unit + integration)
pnpm --filter backend run test
pnpm --filter backend run test:e2e

# Linting + formatting
pnpm run lint
pnpm run format

# Build
pnpm --filter backend run build
pnpm --filter frontend run build

# Database (custom scripts)
pnpm --filter backend run db:migrate          # Run pending migrations
pnpm --filter backend run db:migrate:status   # Check migration status
pnpm --filter backend run db:rollback         # Rollback last migration

# Clean + reinstall
pnpm clean
pnpm install
```

### Code Quality

- **Coverage:** `pnpm --filter backend run test:cov` (meta: branches ≥75%)
- **Linting:** ESLint + Biome (see `.biomerc`)
- **TypeScript:** strict mode, no `any`
- **Tests:** Jest (unit), Supertest (e2e)

---

## 🧪 Testing

### Backend

```bash
# Unit + integration
pnpm --filter backend run test

# E2E (full stack)
pnpm --filter backend run test:e2e

# Watch mode
pnpm --filter backend run test -- --watch

# Coverage
pnpm --filter backend run test:cov
# Meta: lines ≥78%, branches ≥75% (currently 60%)
```

### Frontend

```bash
# Unit tests (Jest)
pnpm --filter frontend run test

# E2E tests (Playwright)
pnpm --filter frontend run test:e2e
```

---

## 🔐 Security

### Key Points

- ✅ JWT dual (access 15min + refresh 7d), secrets in env vars
- ✅ bcrypt password hashing (cost 12)
- ✅ Rate limiting (100 req/min per user/IP)
- ✅ SQL parametrized (100% TypeORM + `$1, $2` for raw queries)
- ✅ CORS whitelist (env var `CORS_ALLOWED_ORIGINS`)
- ✅ Helmet security headers (CSP, HSTS, frame-options)
- ✅ Audit logging (actor, action, resource, timestamp)

### Recent Audit (2026-10-18)

- 2 critical + 25 high CVEs from dependencies (not design flaws)
- See `SECURITY_AUDIT_2026-10-18.md` + `SECURITY_ACTION_PLAN_2026-10-18.md` for remediation

---

## 🐳 Docker & Deployment

### Local Dev

```bash
# Start infra only (backend runs in Node, not Docker)
docker compose up -d

# Or: everything in Docker
docker compose --profile staging up -d --build
```

### Staging/Production

```bash
# Build images
docker compose --profile staging build

# Deploy
docker compose --profile staging up -d

# View logs
docker compose logs -f backend
docker compose logs -f frontend
```

### Environment Variables

See `.env.example` files. Critical:
- `POSTGRES_PASSWORD`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `CORS_ALLOWED_ORIGINS` (staging/prod only)
- `SENTRY_DSN` (optional, error tracking)

---

## 📚 API Documentation

### Endpoints

Interactive Swagger docs: `http://localhost:3001/api/docs` (dev only)

### Main Routes

- **Auth** — `POST /api/auth/login`, `/register`, `/refresh`
- **Incidents** — `GET/POST /api/incidents`, `/feed`
- **Users** — `GET/PATCH /api/users`, admin CRUD
- **Realtime** — WebSocket `/socket.io` (Socket.IO)

See [backend/src/modules](backend/src/modules) for full details.

---

## 🤝 Contributing

1. **Fork + branch** from `main` or `develop`
2. **Commit** with conventional commits (`feat:`, `fix:`, `docs:`, etc.)
3. **Push** + open PR
4. **CI** must pass (tests, lint, build)
5. **Code review** before merge

### Guidelines

- No AI co-author in commits
- RTK commands for token efficiency (see `CLAUDE.md`)
- One logical change per PR
- Tests for new features

---

## 📄 Licencia

Código abierto (*Open Source*). Aporte tecnológico para seguridad vial y gestión comunitaria en Santa Elena, Ecuador.

---

## 📖 Documentación Completa

- [Stack Tecnológico](docs/stack-tecnologico.md)
- [Architecture Decision Records](docs/adr/)
- [Database Schema](database/schema.sql)
- [API Endpoints](backend/src/modules/README.md)
- [Security Policy](SECURITY.md)

---

## 🛠️ Troubleshooting

### Backend won't start

```bash
# Check DB connection
docker compose logs postgres
# Ensure POSTGRES_PASSWORD in .env matches compose.yaml

# Check Redis
docker compose logs redis

# Check migrations
pnpm --filter backend run migration:show
```

### Frontend can't reach API

- Check `API_URL` in `frontend/.env`
- Ensure backend is running: `curl http://localhost:3001/api/health`
- Check CORS: `CORS_ALLOWED_ORIGINS` must include frontend origin

### Tests fail

```bash
# Clear cache + reinstall
pnpm clean
pnpm install

# Run tests with output
pnpm --filter backend run test -- --verbose
```

---

## 📞 Support

Issues, questions? File a GitHub issue or contact the dev team.

---

**Última actualización:** 2026-10-18
