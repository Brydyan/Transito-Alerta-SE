#!/bin/sh
set -e

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@postgres:5432/transito_alerta}"
echo "[migrations] DB_URL=$DB_URL"

echo "[migrations] Testing DB connection..."
if ! psql "$DB_URL" -c "SELECT 1" > /dev/null 2>&1; then
  echo "[migrations] ERROR: Cannot connect to database"
  exit 1
fi
echo "[migrations] ✓ Connected."

echo "[migrations] Checking schema_migrations table..."
SCHEMA_EXISTS=$(psql "$DB_URL" -tc "SELECT to_regclass('schema_migrations') IS NOT NULL" 2>/dev/null || echo 'f')
echo "[migrations] schema_migrations exists: $SCHEMA_EXISTS"

if [ "$SCHEMA_EXISTS" = 'f' ]; then
  echo "[migrations] ► Bootstrapping schema (applying 0001-0062)..."
  for f in /app/database/migrations/*.sql; do
    fname=$(basename "$f")
    echo "  → $fname"
    if ! psql "$DB_URL" -f "$f" > /dev/null 2>&1; then
      echo "  ✗ ERROR applying $fname"
      psql "$DB_URL" -f "$f" 2>&1 | tail -20
      exit 1
    fi
  done
  echo "[migrations] ✓ Bootstrap complete."
else
  echo "[migrations] ✓ Schema exists. Skipping bootstrap."
fi

echo "[migrations] ► Validating checksums..."
exec npx ts-node scripts/run-migrations.ts
