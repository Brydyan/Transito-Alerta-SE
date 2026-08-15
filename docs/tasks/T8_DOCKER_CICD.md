# T8: Docker + CI/CD Setup

**Responsable:** DB/DevOps  
**Duración:** 1 semana  
**Prioridad:** 🟡 MEDIA  
**Dependencia:** T1, T2, T3 (finalizadas)

---

## 📝 Descripción

Containerizar aplicación (Backend + Frontend) y configurar CI/CD con GitHub Actions.

---

## 🛠️ Pasos Detallados

### Paso 1: Backend Dockerfile

**File: `backend/Dockerfile`**
```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/main.js"]
```

**File: `backend/.dockerignore`**
```
node_modules
npm-debug.log
dist
.env
.git
.gitignore
README.md
test
coverage
```

### Paso 2: Frontend Dockerfile

**File: `frontend/Dockerfile`**
```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# Production stage
FROM nginx:alpine

COPY nginx.conf /etc/nginx/nginx.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

**File: `frontend/nginx.conf`**
```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
  worker_connections 1024;
}

http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;

  sendfile on;
  keepalive_timeout 65;
  gzip on;

  server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # Cache assets
    location /assets {
      expires 30d;
      add_header Cache-Control "public, immutable";
    }

    # SPA routing: /api/* → backend, everything else → index.html
    location /api/ {
      proxy_pass http://backend:3001;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
      try_files $uri $uri/ /index.html;
    }
  }
}
```

**File: `frontend/.dockerignore`**
```
node_modules
.git
.gitignore
README.md
coverage
e2e
```

### Paso 3: Docker Compose (Completo)

**File: `docker-compose.yml`** (actualizar/crear)
```yaml
version: '3.8'

services:
  postgres:
    image: postgis/postgis:16-3.4
    container_name: transito-alerta-db
    environment:
      POSTGRES_DB: transito_alerta_se
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backend/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - transito-net

  redis:
    image: redis:7-alpine
    container_name: transito-alerta-redis
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - transito-net

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: transito-alerta-api
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      DB_HOST: ${DB_HOST:-postgres}
      DB_PORT: ${DB_PORT:-5432}
      DB_USER: ${DB_USER:-postgres}
      DB_PASSWORD: ${DB_PASSWORD:?set DB_PASSWORD in .env}
      DB_NAME: ${DB_NAME:-transito_alerta_se}
      REDIS_URL: ${REDIS_URL:-redis://redis:6379}
      JWT_SECRET: ${JWT_SECRET:?set JWT_SECRET in .env}
      SENTRY_DSN: ${SENTRY_DSN:-}
    ports:
      - "3001:3001"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - transito-net
    volumes:
      - ./backend/src:/app/src

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: transito-alerta-web
    ports:
      - "80:80"
    depends_on:
      - backend
    networks:
      - transito-net

volumes:
  postgres_data:

networks:
  transito-net:
    driver: bridge
```

**File: `.env.example`**
```bash
# Database
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=transito_alerta_se

# Redis
REDIS_URL=redis://redis:6379

# Backend
NODE_ENV=development
JWT_SECRET=dev-secret-key
JWT_EXPIRATION=24h

# Frontend
ANGULAR_API_URL=http://localhost:3001/api

# Monitoring
SENTRY_DSN=

# Application
PORT=3001
```

### Paso 4: GitHub Actions CI/CD

**File: `.github/workflows/ci.yml`**
```yaml
name: CI Pipeline

on:
  push:
    branches: [develop, main]
  pull_request:
    branches: [develop, main]

jobs:
  lint-and-type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install backend deps
        run: cd backend && npm ci

      - name: Lint backend
        run: cd backend && npm run lint

      - name: Type check backend
        run: cd backend && npx tsc --noEmit

      - name: Install frontend deps
        run: cd frontend && npm ci

      - name: Lint frontend
        run: cd frontend && npm run lint

      - name: Type check frontend
        run: cd frontend && npx ng build --configuration production --strict

  test-backend:
    runs-on: ubuntu-latest
    needs: lint-and-type-check
    services:
      postgres:
        image: postgis/postgis:16-3.4
        env:
          POSTGRES_DB: test_db
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install deps
        run: cd backend && npm ci

      - name: Run tests
        run: cd backend && npm run test -- --coverage
        env:
          DB_HOST: localhost
          DB_USER: postgres
          DB_PASSWORD: postgres
          DB_NAME: test_db

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./backend/coverage/lcov.info

  test-frontend:
    runs-on: ubuntu-latest
    needs: lint-and-type-check
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install deps
        run: cd frontend && npm ci

      - name: Run tests
        run: cd frontend && npm run test -- --code-coverage --watch=false

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./frontend/coverage/lcov.info

  build-docker:
    runs-on: ubuntu-latest
    needs: [test-backend, test-frontend]
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2

      - name: Build backend
        uses: docker/build-push-action@v4
        with:
          context: ./backend
          push: false
          tags: transito-alerta-api:${{ github.sha }}

      - name: Build frontend
        uses: docker/build-push-action@v4
        with:
          context: ./frontend
          push: false
          tags: transito-alerta-web:${{ github.sha }}
```

**File: `.github/workflows/deploy.yml`** (optional - para deployment)
```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Deploy to production
        run: |
          echo "Deploy logic here"
          # Example: docker-compose pull && docker-compose up -d
```

### Paso 5: Local Development Setup

**File: `docs/SETUP.md`**
```markdown
# Guía de Setup Local

## Requisitos
- Docker y Docker Compose >= 20.10
- Node.js >= 20
- npm >= 9

## Instalación

### 1. Clonar repositorio
\`\`\`bash
git clone https://github.com/tu-usuario/transito-alerta-se.git
cd transito-alerta-se
\`\`\`

### 2. Configurar variables de entorno
\`\`\`bash
cp .env.example .env
# Editar .env si es necesario
\`\`\`

### 3. Levantar contenedores
\`\`\`bash
docker-compose up -d
\`\`\`

### 4. Esperar a que los servicios estén listos
\`\`\`bash
# Verificar PostgreSQL
docker exec transito-alerta-db psql -U postgres -d transito_alerta_se -c "SELECT 1"

# Verificar Redis
docker exec transito-alerta-redis redis-cli ping

# Verificar API
curl http://localhost:3001/health

# Verificar Frontend
open http://localhost
\`\`\`

### 5. Migraciones (si es necesario)
\`\`\`bash
docker exec transito-alerta-api npm run migrate
\`\`\`

## Desarrollo

### Backend
\`\`\`bash
cd backend
npm install
npm run dev  # Inicia en puerto 3001
\`\`\`

### Frontend
\`\`\`bash
cd frontend
npm install
ng serve  # Inicia en puerto 4200
\`\`\`

## Testing

\`\`\`bash
# Backend
cd backend && npm run test

# Frontend
cd frontend && npm run test

# E2E
cd frontend && npx playwright test
\`\`\`

## Logs
\`\`\`bash
# Ver logs de un servicio
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
\`\`\`

## Limpiar
\`\`\`bash
docker-compose down -v  # Borra volúmenes también
\`\`\`
```

### Paso 6: Verificar Setup

```bash
# Lanzar todo
cd /path/to/transito-alerta-se
docker-compose up -d

# Esperar 30 segundos
sleep 30

# Tests de conectividad
echo "Backend health:"
curl http://localhost:3001/health

echo "Frontend:"
curl http://localhost/

echo "PostgreSQL:"
docker exec transito-alerta-db psql -U postgres -d transito_alerta_se -c "SELECT 1"

echo "Redis:"
docker exec transito-alerta-redis redis-cli ping

# Ver logs
docker-compose logs --tail=50
```

---

## ✅ Criterios de Aceptación

- [ ] **Backend Dockerfile**
  - [ ] Build stage con `npm run build`
  - [ ] Production stage sin devDeps
  - [ ] EXPOSE 3001
  - [ ] CMD ejecuta app correctamente
  - [ ] .dockerignore configurado

- [ ] **Frontend Dockerfile**
  - [ ] Build stage con `npm run build`
  - [ ] Nginx en production stage
  - [ ] nginx.conf con SPA routing
  - [ ] EXPOSE 80
  - [ ] Assets cacheables

- [ ] **Docker Compose**
  - [ ] 4 servicios: postgres, redis, backend, frontend
  - [ ] Health checks configurados
  - [ ] Volúmenes persistentes (postgres_data)
  - [ ] Variables de entorno en `.env`
  - [ ] Networking: transito-net bridge
  - [ ] Puertos correctos: 5432, 6379, 3001, 80
  - [ ] Dependencias (depends_on) correctas

- [ ] **GitHub Actions**
  - [ ] Lint job ejecuta
  - [ ] Type check pasa
  - [ ] Backend tests con coverage
  - [ ] Frontend tests con coverage
  - [ ] Docker build job (en main)
  - [ ] Codecov upload configurado

- [ ] **Documentation**
  - [ ] SETUP.md completo
  - [ ] Comandos para dev/test/deploy
  - [ ] Troubleshooting incluido
  - [ ] Variables de entorno documentadas

- [ ] **Local Development**
  - [ ] `docker-compose up -d` levanta sin errores
  - [ ] Todos los servicios healthy (docker ps)
  - [ ] Backend responde en 3001
  - [ ] Frontend accesible en 80
  - [ ] PostgreSQL con datos seed
  - [ ] Redis funcionando
  - [ ] Logs accesibles

- [ ] **CI/CD Pipeline**
  - [ ] Tests pasan en CI
  - [ ] Coverage > 60%
  - [ ] Dockerfiles build sin error
  - [ ] Workflow ejecuta en push a develop/main

---

## 🔗 Referencias

- **Docker:** https://www.docker.com/
- **Docker Compose:** https://docs.docker.com/compose/
- **GitHub Actions:** https://github.com/features/actions

---

**Status:** ⏳ TODO  
**Assigned to:** DB/DevOps  
**Start date:** YYYY-MM-DD  
**End date:** YYYY-MM-DD
