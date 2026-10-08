#!/usr/bin/env bash
#
# Apply pending SQL migrations from `database/migrations` to a local database.
#
# Why this exists
# ---------------
# Nothing in this repo applied pending migrations, so schema drift
# accumulated silently:
#
#   * `scripts/entrypoint-migrations.sh` bootstraps ALL files ONLY when
#     `schema_migrations` does not exist. Once it does, it prints
#     "Schema exists. Skipping bootstrap." and exits 0 — it never applies
#     anything new.
#   * `scripts/run-migrations.ts` is read-only: `--status`, `--list`,
#     `--down` and checksum validation. Its default mode explicitly does
#     not apply ("NO APLICA NADA").
#
# Symptom it prevents: an entity declaring a column that the table never
# received (e.g. `IncidentCategoryEntity.priority` vs migration 0065), which
# surfaces as a 500 `column ... does not exist` at runtime.
#
# Usage
# -----
#   ./backend/scripts/apply-pending-migrations.sh             # apply pending
#   ./backend/scripts/apply-pending-migrations.sh --status    # read-only report
#   ./backend/scripts/apply-pending-migrations.sh --dry-run   # show what would run
#
# Database target (first match wins)
# -----------------------------------
#   1. $DATABASE_URL                       (any reachable Postgres)
#   2. running `tase-postgres` container   (podman, then docker)
#
# Rules
# -----
#   * PENDING  = version absent from `schema_migrations` AND > MAX(version).
#                Applied in numeric order, so MAX stays monotonic.
#   * UNRECORDED = version absent from the ledger but <= MAX(version). These
#                are almost certainly already applied (the bootstrap loop ran
#                every file without registering them), so re-running a
#                non-idempotent migration could corrupt data. Reported as a
#                warning, NEVER applied automatically. Fix the ledger by hand
#                after confirming the effect exists:
#                  INSERT INTO schema_migrations (version, name, checksum, applied_at)
#                  VALUES ('0062', '0062_incident_category_description.sql',
#                          'manual', now())
#                  ON CONFLICT (version) DO NOTHING;
#   * Each file runs with ON_ERROR_STOP=1. Migrations that open their own
#     BEGIN/COMMIT are passed through as-is (no --single-transaction).
#   * A migration is registered only after psql reports success. On failure
#     the script stops immediately and registers nothing.
#
set -euo pipefail

# ── repo layout ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/database/migrations"

MODE="apply"
case "${1:-}" in
  --status)  MODE="status" ;;
  --dry-run) MODE="dry" ;;
  ""|--apply) MODE="apply" ;;
  -h|--help) sed -n '2,45p' "${BASH_SOURCE[0]}"; exit 0 ;;
  *) echo "ERROR: unknown option '$1' (use --status, --dry-run, --apply or --help)" >&2; exit 127 ;;
esac

# ── resolve psql invocation ──────────────────────────────────────────────────
PSQL=()
if [ -n "${DATABASE_URL:-}" ]; then
  PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qAt)
else
  RUNTIME=""
  if command -v podman >/dev/null 2>&1 && podman ps --format '{{.Names}}' 2>/dev/null | grep -qx 'tase-postgres'; then
    RUNTIME="podman"
  elif command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'tase-postgres'; then
    RUNTIME="docker"
  fi

  if [ -n "$RUNTIME" ]; then
    PSQL=("$RUNTIME" exec -i tase-postgres psql -U postgres -d transito_alerta -v ON_ERROR_STOP=1 -qAt)
  else
    echo "ERROR: no database target." >&2
    echo "  Set DATABASE_URL, or start the local stack:" >&2
    echo "      docker compose up -d postgres" >&2
    exit 1
  fi
fi

# ── prerequisite: ledger table ───────────────────────────────────────────────
LEDGER_EXISTS="$("${PSQL[@]}" -c "SELECT to_regclass('schema_migrations') IS NOT NULL" 2>/dev/null | tr -d '[:space:]')"
if [ "$LEDGER_EXISTS" != "t" ]; then
  echo "ERROR: table schema_migrations does not exist (migration 0030 not applied)." >&2
  echo "       Bootstrap first: docker compose up migrations" >&2
  exit 1
fi

# ── ledger state ─────────────────────────────────────────────────────────────
APPLIED="$("${PSQL[@]}" -c 'SELECT version FROM schema_migrations')"
APPLIED_COUNT="$(printf '%s\n' "$APPLIED" | grep -c . || true)"
MAX_APPLIED="$("${PSQL[@]}" -c "SELECT COALESCE(MAX(version), '0000') FROM schema_migrations")"

is_applied() {
  printf '%s\n' "$APPLIED" | grep -qx "$1"
}

# ── classify every migration file ────────────────────────────────────────────
PENDING=()
UNRECORDED=()

shopt -s nullglob
FILES=("$MIGRATIONS_DIR"/[0-9]*.sql)
shopt -u nullglob

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "ERROR: no migration files found in $MIGRATIONS_DIR" >&2
  exit 1
fi

# Sort by version prefix (0001 … 0065, then 1000 …), not by raw string:
# `sort -V` understands embedded numbers, so a future 4-digit+ version still
# lands after 0065. The common path prefix makes a full-path sort equivalent
# to sorting by filename.
IFS=$'\n' FILES=($(printf '%s\n' "${FILES[@]}" | sort -V)); unset IFS

for f in "${FILES[@]}"; do
  base="$(basename "$f")"
  version="${base%%_*}"
  case "$version" in (*[!0-9]*|'') continue ;; esac

  if is_applied "$version"; then
    continue
  elif [[ "$version" > "$MAX_APPLIED" ]]; then
    PENDING+=("$f")
  else
    UNRECORDED+=("$base")
  fi
done

# Duplicate version prefixes: `schema_migrations` is keyed by version alone, so
# the second file of a pair is invisible to every tool that matches on version
# (this script, run-migrations.ts, the entrypoint). It would be silently
# skipped. Renumber instead of trusting the ledger here.
DUPES="$(printf '%s\n' "${FILES[@]}" | xargs -n1 basename | cut -d_ -f1 |
         grep -E '^[0-9]+$' | sort | uniq -d)"

# ── report ───────────────────────────────────────────────────────────────────
echo "Ledger: $APPLIED_COUNT recorded · max version $MAX_APPLIED · ${#PENDING[@]} pending · ${#UNRECORDED[@]} unrecorded"
echo

if [ -n "$DUPES" ]; then
  echo "⚠  DUPLICATE VERSION PREFIXES — schema_migrations is keyed by version,"
  echo "   so the second file of each pair is invisible to every migration tool."
  echo "   Renumber them before trusting any ledger comparison:"
  printf '%s\n' "$DUPES" | while read -r v; do
    printf '     %s -> %s\n' "$v" "$(printf '%s\n' "${FILES[@]}" |
      xargs -n1 basename | grep "^${v}_" | tr '\n' ' ')"
  done
  echo
fi

if [ "${#UNRECORDED[@]}" -gt 0 ]; then
  echo "⚠  UNRECORDED (<= max, NOT applied automatically — verify by hand):"
  for f in "${UNRECORDED[@]}"; do echo "     $f"; done
  echo
fi

if [ "${#PENDING[@]}" -eq 0 ]; then
  echo "✅ Nothing pending. Schema is up to date."
  exit 0
fi

echo "PENDING (will run in this order):"
for f in "${PENDING[@]}"; do echo "     $(basename "$f")"; done
echo

if [ "$MODE" = "status" ]; then
  echo "Run without flags (or with --apply) to execute them."
  exit 0
fi
if [ "$MODE" = "dry" ]; then
  echo "--dry-run: no changes made."
  exit 0
fi

# ── apply ────────────────────────────────────────────────────────────────────
sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

for f in "${PENDING[@]}"; do
  base="$(basename "$f")"
  version="${base%%_*}"
  checksum="$(sha256 "$f")"

  echo "→ $base"
  # Feed the file over stdin, never `-f <host path>`: when the target is the
  # tase-postgres container, a host path does not exist inside it.
  if ! "${PSQL[@]}" < "$f"; then
    echo "✗ FAILED: $base — nothing was registered for it." >&2
    echo "  Fix the error above and re-run this script." >&2
    exit 1
  fi

  "${PSQL[@]}" -c "INSERT INTO schema_migrations (version, name, checksum, applied_at)
                   VALUES ('$version', '$base', '$checksum', now())
                   ON CONFLICT (version) DO NOTHING"
  echo "  ✓ applied + recorded"
done

echo
echo "✅ Done: ${#PENDING[@]} migration(s) applied."
echo "   Restart the backend so it re-reads the schema:"
echo "       pnpm --dir backend run start:dev"
