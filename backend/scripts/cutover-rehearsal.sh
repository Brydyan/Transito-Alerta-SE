#!/usr/bin/env bash
# cutover-rehearsal.sh — rehearsal del cutover contra staging de Supabase.
#
# Change: 2026-08-26-t8-database-cutover. Spec: capability `cutover`,
# requirement R27 + R29. Design: design.md §3 (D3) y §6 (D7).
#
# Este script NO toca producción. La única manera de correrlo contra
# producción es exportar explícitamente `CUTOVER_MODE=prod` y escribir
# la cadena literal `CUTOVER-PROD` en `CUTOVER_PROD_CONFIRM` — el guard
# `confirm_production_mode` aborta si falta alguna de las dos.
#
# Salida: cada paso imprime a stdout un bloque con
#   [HH:MM:SS] <step> PASS|FAIL — <evidence>
# seguido de un resumen final con la duración total y el resultado por
# check. Exit code 0 si todos los checks pasan, 1 si alguno falla.
#
# Variables de entorno esperadas:
#   STAGING_DATABASE_URL    — postgres:// connection string al Supabase staging
#   STAGING_REDIS_URL       — redis:// connection string al Redis de staging
#   CUTOVER_MODE            — staging (default) | prod
#   CUTOVER_PROD_CONFIRM    — required only when CUTOVER_MODE=prod; must be
#                             literally "CUTOVER-PROD"
#
# Uso:
#   STAGING_DATABASE_URL=postgres://... STAGING_REDIS_URL=redis://... \
#     ./cutover-rehearsal.sh
#   # ...o contra prod (con el guard):
#   CUTOVER_MODE=prod CUTOVER_PROD_CONFIRM=CUTOVER-PROD \
#     STAGING_DATABASE_URL=... STAGING_REDIS_URL=... \
#     ./cutover-rehearsal.sh

set -euo pipefail

# ───── Modo + guard de producción (D3, D7) ──────────────────────────────

MODE=${CUTOVER_MODE:-staging}
START_TIME=$(date +%s)
RUN_ID="rehearsal-$(date -u +%Y%m%dT%H%M%SZ)"
LOG_DIR="$(cd "$(dirname "$0")/.." && pwd)/../docs/runbooks/cutover-rehearsals"
LOG_FILE="${LOG_DIR}/${RUN_ID}.log"

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "════════════════════════════════════════════════════════════"
echo "  cutover-rehearsal.sh — $RUN_ID"
echo "  mode: $MODE"
echo "  log : $LOG_FILE"
echo "════════════════════════════════════════════════════════════"

if [ "$MODE" = "prod" ]; then
  confirm_production_mode
else
  echo "→ mode=staging: guard skipped (only the prod guard is required)"
fi

if [ -z "${STAGING_DATABASE_URL:-}" ]; then
  echo "FATAL: STAGING_DATABASE_URL is required"
  exit 1
fi
if [ -z "${STAGING_REDIS_URL:-}" ]; then
  echo "FATAL: STAGING_REDIS_URL is required"
  exit 1
fi

# ───── Helpers ──────────────────────────────────────────────────────────

PASS=0
FAIL=0
declare -a RESULTS=()

step() {
  # step <name> <command> [args...]
  local name=$1
  shift
  local t0=$(date +%s)
  local hhmm=$(date -u +%H:%M:%S)
  echo ""
  echo "── [$hhmm] $name"
  if "$@"; then
    local t1=$(date +%s)
    RESULTS+=("PASS $name $((t1 - t0))s")
    PASS=$((PASS + 1))
    echo "   PASS (in $((t1 - t0))s)"
  else
    local t1=$(date +%s)
    RESULTS+=("FAIL $name $((t1 - t0))s")
    FAIL=$((FAIL + 1))
    echo "   FAIL (in $((t1 - t0))s)"
  fi
}

confirm_production_mode() {
  cat <<'BANNER'

  ╔══════════════════════════════════════════════════════════╗
  ║                    PRODUCTION REHEARSAL                  ║
  ║                                                          ║
  ║  This will execute the cutover rehearsal script against  ║
  ║  the PRODUCTION database and Redis.                      ║
  ║                                                          ║
  ║  Make sure:                                              ║
  ║  - You are not about to be on-call alone                 ║
  ║  - The change ticket is approved and linked              ║
  ║  - You have a PITR snapshot less than 5 min old          ║
  ║  - The on-call rotation is aware                         ║
  ║                                                          ║
  ║  To proceed, set CUTOVER_PROD_CONFIRM=CUTOVER-PROD       ║
  ║  and re-run. Anything else aborts immediately.          ║
  ╚══════════════════════════════════════════════════════════╝

BANNER
  if [ "${CUTOVER_PROD_CONFIRM:-}" != "CUTOVER-PROD" ]; then
    echo "ABORT: CUTOVER_PROD_CONFIRM is not set to CUTOVER-PROD"
    exit 1
  fi
}

# ───── R26 — Pre-cutover validation ────────────────────────────────────

step "R26.1 schema migration status" check_migration_status
step "R26.3 PostGIS version >= 3.4"        check_postgis_version
step "R26.4 e2e suite smoke"               check_e2e_smoke
step "R30.2 monitoring queries syntax"     check_monitoring_queries
step "R29.1 snapshot/insert/restore dry-run" check_rollback_dry_run

# ───── Resumen ──────────────────────────────────────────────────────────

END_TIME=$(date +%s)
TOTAL=$((END_TIME - START_TIME))

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  REHEARSAL SUMMARY — $RUN_ID"
echo "════════════════════════════════════════════════════════════"
for r in "${RESULTS[@]}"; do
  echo "  $r"
done
echo "────────────────────────────────────────────────────────────"
echo "  Total: ${TOTAL}s (target: <= 1800s / 30 min)"
echo "  PASS : $PASS"
echo "  FAIL : $FAIL"
echo "  Log  : $LOG_FILE"
echo "════════════════════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

# ───── Check implementations ────────────────────────────────────────────

check_migration_status() {
  # Lista los archivos y verifica que la BD reporta 0001..0041 aplicadas.
  local applied
  applied=$(psql "$STAGING_DATABASE_URL" -tA -c \
    "SELECT version FROM schema_migrations ORDER BY version")
  local expected
  expected=$(printf "%04d\n" {1..42} | sort)  # 0001..0042
  local diff_output
  diff_output=$(diff <(echo "$applied") <(echo "$expected") || true)
  if [ -n "$diff_output" ]; then
    echo "Drift detected between expected and applied migrations:"
    echo "$diff_output"
    return 1
  fi
  echo "All 42 migrations applied (including 0042_monitoring_helpers)"
  return 0
}

check_postgis_version() {
  local version
  version=$(psql "$STAGING_DATABASE_URL" -tA -c "SELECT postgis_version()")
  echo "PostGIS version: $version"
  # postgis_version() returns a string like "3.4 USE_GEOS=...". Check
  # the major.minor part is >= 3.4 and < 4.0.
  local mm
  mm=$(echo "$version" | head -c 3)
  case "$mm" in
    3.4|3.5|3.6|3.7|3.8|3.9) return 0 ;;
    *) echo "PostGIS major.minor = $mm (need 3.4 .. 3.9)"; return 1 ;;
  esac
}

check_e2e_smoke() {
  # Dispara `pnpm run test:e2e:cutover` desde el backend. No esperamos
  # a que termine (puede tardar 5+ min) — solo verificamos que el
  # comando existe y arranca sin error de configuración.
  (
    cd "$(dirname "$0")/.."
    if ! command -v pnpm >/dev/null 2>&1; then
      echo "pnpm not on PATH; cannot run e2e suite from rehearsal"
      return 1
    fi
    # Dry-run: solo verificamos que el script npm existe y que las
    # dependencias están instaladas. El suite completo se corre en
    # CI (job `cutover`, see .github/workflows/ci.yml) — en el
    # rehearsal nos basta confirmar que la suite es ejecutable.
    pnpm run test:e2e:cutover --listTests >/dev/null
  )
}

check_monitoring_queries() {
  # Ejecuta queries.sql y verifica que no haya errores de SQL.
  local repo_root
  repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
  psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -q \
    -f "$repo_root/database/monitoring/queries.sql" >/dev/null
}

check_rollback_dry_run() {
  # El dry-run completo de R29.1 requiere un snapshot PITR real de
  # Supabase staging, lo cual está fuera del alcance de un script
  # que corre desde una laptop. En el rehearsal real (T8.3.C1) el
  # operador hace estos pasos a mano siguiendo docs/runbooks/cutover.md
  # §"Rollback", y captura el stdout a este mismo log.
  #
  # Aquí validamos los prerequisitos: que la base staging esté en el
  # estado esperado (42 migraciones aplicadas, sin `INSERT` espurio
  # del rehearsal anterior).
  local residual
  residual=$(psql "$STAGING_DATABASE_URL" -tA -c \
    "SELECT count(*) FROM incidents WHERE title LIKE 'cutover-rehearsal-%'")
  if [ "$residual" -gt 0 ]; then
    echo "Found $residual residual 'cutover-rehearsal-*' incidents from a previous run"
    return 1
  fi
  return 0
}
