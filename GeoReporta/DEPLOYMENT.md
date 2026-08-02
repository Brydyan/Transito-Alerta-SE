# Deployment Guide

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| PHP | ^8.3 | with extensions: pdo_pgsql, zip, mbstring, bcmath, sockets, pcntl, redis, sodium |
| Composer | 2.x | |
| PostgreSQL | 17 | with PostGIS 3.5 extension |
| Redis | 8.x | |
| Swoole | latest (PHP extension) | required only for Octane mode |

---

## Local (without Docker)

### 1. Install dependencies

```bash
cd backend
composer install
```

### 2. Configure environment

```bash
cp .env.example .env   # if it doesn't exist, create .env manually
php artisan key:generate
```

Edit `backend/.env`:

```env
DB_CONNECTION=pgsql
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=incidencias_db
DB_USERNAME=your_user
DB_PASSWORD=your_password

REDIS_HOST=localhost
REDIS_PORT=6379
```

### 3. Run migrations

```bash
php artisan migrate
```

### 4. Start server

**Option A — PHP built-in (dev only):**

```bash
php artisan serve
# http://localhost:8000
```

**Option B — Octane + Swoole (same as production):**

```bash
php artisan octane:start --server=swoole --host=0.0.0.0 --port=8000
```

> Production requires the `swoole` PHP extension (auto-installed in the docker image via `install-php-extensions swoole`).

---

## Docker

### 1. Configure environment

Create `backend/.env` with your secrets (DB passwords, APP_KEY, etc.).
The following variables are **overridden by docker-compose.yml** and do not need to match:

```env
DB_HOST=localhost      # ignored in Docker — compose forces DB_HOST=db
REDIS_HOST=localhost   # ignored in Docker — compose forces REDIS_HOST=redis
```

### 2. Build and start all services

```bash
docker compose up --build -d
```

Services started:

| Service | Port | Image |
|---------|------|-------|
| backend | 8000 | PHP 8.3 + Octane 2.17 over Swoole 5 |
| frontend | 3000 | nginx:alpine |
| db | 5432 | postgis/postgis:17-3.5-alpine |
| redis | 6379 | redis:8-alpine |

### 3. Check status

```bash
docker compose ps
docker compose logs backend -f
```

### 4. Stop

```bash
docker compose down
```

To also remove volumes (database data):

```bash
docker compose down -v
```

---

## Common Issues

### `DB_HOST=localhost` in Docker

Docker containers communicate via service names, not `localhost`.
`docker-compose.yml` hardcodes `DB_HOST=db` and `REDIS_HOST=redis` in the backend environment block — this overrides whatever is in `backend/.env`.

### `exec /usr/local/bin/entrypoint.sh: no such file or directory`

Alpine base image — ensure `bash` is installed in the Dockerfile:

```dockerfile
RUN apk add --no-cache bash
```

### Migrations fail on startup

The entrypoint waits 30s for the DB. If it times out, check:

```bash
docker compose logs db
docker compose ps db
```
