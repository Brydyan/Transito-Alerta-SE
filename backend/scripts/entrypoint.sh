#!/bin/sh
# Backend entrypoint: valida + aplica migraciones, luego arranca el app
#
# Exit codes:
#   0 — Migraciones OK, app started
#   1 — Drift o error en migraciones (contenedor falla)

set -e

echo "🔍 Validating migrations..."
npx ts-node scripts/run-migrations.ts

if [ $? -ne 0 ]; then
  echo "❌ Migration validation failed. Aborting startup."
  exit 1
fi

echo "✅ Migrations valid. Starting app..."
exec node dist/src/main.js
