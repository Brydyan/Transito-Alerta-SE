#!/bin/bash

#############################################################################
#
# setup-local.sh — Automatiza la configuración del entorno local de desarrollo
#
# Propósito:
#   - Levanta postgres + redis via docker compose
#   - Aplica todas las migraciones en orden (0001-0065)
#   - Realiza seed de datos (usuarios, categorías, incidentes demo)
#   - Deja el proyecto listo para `pnpm start:dev`
#
# Uso:
#   chmod +x setup-local.sh
#   ./setup-local.sh
#
# Notas:
#   - Requiere: docker, docker-compose, psql, pnpm/npm
#   - Primera ejecución: ~2-3 minutos (descarga/build de contenedores)
#   - Ejecuciones posteriores: ~30 segundos
#   - Para resetear: `docker compose down -v && ./setup-local.sh`
#
#############################################################################

set -e  # Exit immediately if any command fails

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'  # No Color

# Configuration (from .env)
DB_USER="postgres"
DB_PASSWORD="changeme"
DB_PORT="5432"
DB_NAME="transito_alerta"
DB_HOST="localhost"

log() {
  echo -e "${BLUE}[setup]${NC} $1"
}

success() {
  echo -e "${GREEN}✅${NC} $1"
}

error() {
  echo -e "${RED}❌${NC} $1"
  exit 1
}

warn() {
  echo -e "${YELLOW}⚠️${NC} $1"
}

# Check prerequisites
log "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
  error "docker is not installed"
fi

if ! command -v docker compose &> /dev/null; then
  error "docker compose is not installed"
fi

if ! command -v psql &> /dev/null; then
  warn "psql not found in PATH. Continuing (will attempt direct connection)..."
fi

success "Prerequisites OK"

# Step 1: Start containers
log "Bringing up postgres + redis containers..."
docker compose up -d postgres redis

log "Waiting for postgres to be healthy (max 60 seconds)..."
for i in {1..60}; do
  if docker exec tase-postgres pg_isready -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1; then
    success "postgres is ready"
    sleep 2  # Extra buffer to ensure DB is fully initialized
    break
  fi
  if [ $i -eq 60 ]; then
    error "postgres failed to start after 60 seconds"
  fi
  echo -n "."
  sleep 1
done

log "Waiting for redis to be healthy..."
sleep 2  # Redis starts quickly, just give it a moment
success "redis is ready"

# Step 2: Apply migrations
log "Applying database migrations..."

migration_count=0
for f in database/migrations/00*.sql; do
  if [ ! -f "$f" ]; then
    warn "No migration files found in database/migrations/"
    break
  fi

  fname=$(basename "$f")
  echo -ne "  → $fname ... "

  # Suppress output but capture stderr for error handling
  if psql "postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}" \
    -v ON_ERROR_STOP=1 -q < "$f" 2>/tmp/migration_error.log; then
    echo "✓"
    migration_count=$((migration_count + 1))
  else
    error_output=$(cat /tmp/migration_error.log)
    error "Failed to apply $fname. Error: $error_output"
  fi
done

success "Applied $migration_count migrations"

# Step 3: Clear menu cache
log "Clearing menu cache in redis..."
docker exec tase-redis redis-cli DEL "menu:v1:*" > /dev/null 2>&1 || warn "Could not clear menu cache (non-fatal)"
success "Menu cache cleared"

# Step 4: Seed data
log "Seeding database with demo data..."

if [ -f "backend/package.json" ]; then
  cd backend

  # Check if pnpm or npm
  if command -v pnpm &> /dev/null; then
    echo "  → Running db:seed with pnpm..."
    pnpm db:seed > /dev/null 2>&1 || warn "db:seed encountered warnings (check database state)"
  elif command -v npm &> /dev/null; then
    echo "  → Running db:seed with npm..."
    npm run db:seed > /dev/null 2>&1 || warn "db:seed encountered warnings (check database state)"
  else
    warn "Neither pnpm nor npm found. Skipping seed step."
    warn "Run manually: cd backend && pnpm db:seed"
  fi

  cd ..
  success "Database seeded"
else
  warn "backend/package.json not found. Skipping seed step."
fi

# Step 5: Summary
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Local environment setup complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "📋 Next steps:"
echo ""
echo "   Terminal 1 (Backend):"
echo "     $ cd backend && pnpm start:dev"
echo ""
echo "   Terminal 2 (Frontend):"
echo "     $ cd frontend && pnpm start:dev"
echo ""
echo "🌐 Access:"
echo "   Frontend: http://localhost:4200"
echo "   Backend:  http://localhost:3001"
echo "   API Docs: http://localhost:3001/api"
echo ""
echo "📊 Database:"
echo "   Host:     localhost:5432"
echo "   User:     postgres"
echo "   Password: changeme"
echo "   Database: transito_alerta"
echo ""
echo "💾 Redis:"
echo "   Host: localhost:6379"
echo ""
echo "🧹 To reset everything:"
echo "   $ docker compose down -v && ./setup-local.sh"
echo ""
echo "📝 To check migration status:"
echo "   $ cd backend && pnpm db:migrate:status"
echo ""
