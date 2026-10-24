#!/usr/bin/env bash
#
# backup.sh — P15 del MINIMAX_BUILDER_SECURITY_IMPLEMENTATION.md
#
# Backup diario de PostgreSQL via `pg_dump` corriendo dentro del
# contenedor `tase-postgres`. Output: archivo binario custom-format
# (.dump) que se puede restaurar con `pg_restore`.
#
# USO:
#   ./database/scripts/backup.sh
#
# CRON entry recomendado (staging):
#   0 2 * * * /opt/transito-alerta/database/scripts/backup.sh >> /var/log/tase-backup.log 2>&1
#
# RESTAURACIÓN (en otra máquina o BD limpia):
#   docker exec -i tase-postgres pg_restore \
#     -U postgres -d transito_alerta --clean --if-exists \
#     < /var/backups/transito-alerta/db-YYYYMMDDTHHMMSSZ.dump
#
# CONFIGURACIÓN:
#   Editar las variables abajo. Por default:
#   - contenedor: tase-postgres (matchea compose.yaml)
#   - BD:         transito_alerta
#   - output:     /var/backups/transito-alerta/
#   - retención:  30 días (archivos más viejos se borran)
#
# SEGURIDAD:
#   - El archivo .dump contiene TODO el contenido de la BD,
#     incluyendo columnas `password_hash` (bcrypt). El directorio
#     de output DEBE estar encriptado en disco o subirse a object
#     storage cifrado (S3 SSE, MinIO SSE-C).
#   - El cron job debe correr como root o un usuario dedicado, NO
#     como el usuario de aplicación.

set -euo pipefail

CONTAINER="${BACKUP_CONTAINER:-tase-postgres}"
DB_USER="${BACKUP_DB_USER:-postgres}"
DB_NAME="${BACKUP_DB_NAME:-transito_alerta}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/transito-alerta}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
OUT_FILE="$BACKUP_DIR/db-$TIMESTAMP.dump"

mkdir -p "$BACKUP_DIR"

# Verificar que el contenedor está corriendo antes de empezar
if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "ERROR: container '$CONTAINER' not running" >&2
  exit 1
fi

# pg_dump en formato custom (-Fc) — binario comprimido, restaurable
# con `pg_restore`. --no-owner --no-acl: el restore no necesita
# recrear roles/grants idénticos a producción.
docker exec "$CONTAINER" pg_dump \
  -U "$DB_USER" -d "$DB_NAME" \
  -Fc --no-owner --no-acl \
  > "$OUT_FILE"

# Verificación mínima: el archivo debe ser >0 bytes y comenzar con
# el magic header de pg_dump custom format (PGDMP).
if [[ ! -s "$OUT_FILE" ]]; then
  echo "ERROR: backup file is empty: $OUT_FILE" >&2
  exit 1
fi

# Retención: borrar archivos .dump más viejos que $RETENTION_DAYS
find "$BACKUP_DIR" -name "db-*.dump" -mtime +"$RETENTION_DAYS" -delete

echo "OK: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"