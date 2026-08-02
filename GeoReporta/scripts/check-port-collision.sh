#!/usr/bin/env bash
# check-port-collision.sh
# Read the project's .env and verify that all published ports are free on
# the host, before attempting `docker compose up -d`.
#
# A port is considered SAFE if either:
#   - Nothing is listening on it, OR
#   - Something IS listening but it's a container from THIS project
#     (docker compose labels project containers with the project name)
#
# Exits 0 if all ports safe, 1 if any is held by another process/stack.

set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"

if [ ! -f "$ENV_FILE" ]; then
  echo "✗ .env not found at $ENV_FILE"
  echo "  Run: cp .env.example .env && edit"
  exit 1
fi

# Load .env (ignore comments and empty lines)
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# Detect project name (defaults to directory basename, sanitized)
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "$PROJECT_DIR" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')}"

echo "=== Port collision pre-check ==="
echo "Project: $COMPOSE_PROJECT_NAME"
echo ""

# Ports we publish from docker-compose.yml
PORTS=()
[ -n "${FRONTEND_PORT:-}" ] && PORTS+=("$FRONTEND_PORT")
[ -n "${BACKEND_PORT:-}" ] && PORTS+=("$BACKEND_PORT")
[ -n "${DB_PORT:-}" ] && PORTS+=("$DB_PORT")
[ -n "${REDIS_PORT:-}" ] && PORTS+=("$REDIS_PORT")
[ -n "${RUSTFS_API_PORT:-}" ] && PORTS+=("$RUSTFS_API_PORT")
[ -n "${RUSTFS_CONSOLE_PORT:-}" ] && PORTS+=("$RUSTFS_CONSOLE_PORT")

if [ ${#PORTS[@]} -eq 0 ]; then
  echo "✓ No ports declared in .env to check"
  exit 0
fi

# Get list of containers belonging to this project (any state)
# docker compose v2 uses label com.docker.compose.project=<name>
our_containers=$(docker ps -a --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" --format "{{.Names}}" 2>/dev/null || true)

free_count=0
ours_count=0
taken_count=0
for port in "${PORTS[@]}"; do
  label=""
  case $port in
    "$FRONTEND_PORT") label="frontend" ;;
    "$BACKEND_PORT") label="backend" ;;
    "$DB_PORT") label="postgres" ;;
    "$REDIS_PORT") label="redis" ;;
    "$RUSTFS_API_PORT") label="rustfs-api" ;;
    "$RUSTFS_CONSOLE_PORT") label="rustfs-console" ;;
  esac

  # Check if anything is listening on this port
  if ! ss -tln "sport = :$port" 2>/dev/null | grep -q ":$port\b"; then
    echo "✓ Port $port ($label) is free"
    free_count=$((free_count + 1))
    continue
  fi

  # Port is taken. Is it by one of our containers?
  # Get container names holding this port
  holders=$(docker ps --filter "publish=$port" --format "{{.Names}}" 2>/dev/null || true)
  if [ -n "$holders" ]; then
    # Check if any holder belongs to our project
    while IFS= read -r holder; do
      if echo "$our_containers" | grep -qF "$holder"; then
        echo "✓ Port $port ($label) is held by our container: $holder"
        ours_count=$((ours_count + 1))
        continue 2
      fi
    done <<< "$holders"
  fi

  # Port is held by something else
  echo "✗ Port $port ($label) is held by ANOTHER process/stack"
  owner_pid=$(sudo ss -tlnp "sport = :$port" 2>/dev/null | grep ":$port" | grep -oP 'pid=\K[0-9]+' | head -1 || true)
  if [ -n "$owner_pid" ]; then
    cmdline=$(cat "/proc/$owner_pid/cmdline" 2>/dev/null | tr '\0' ' ' || echo "unknown")
    echo "    └─ pid=$owner_pid → $cmdline"
  else
    echo "    └─ cannot determine owner (needs sudo to inspect /proc)"
  fi
  taken_count=$((taken_count + 1))
done

echo ""
echo "Summary: $free_count free, $ours_count ours, $taken_count taken"

if [ "$taken_count" -gt 0 ]; then
  echo ""
  echo "✗ Some ports are held by other processes. 'docker compose up -d' will fail."
  echo "  Common fix: kill the orphaned process or change RUSTFS_API_PORT/CONSOLE_PORT in .env"
  echo "  See docs/PORTS.md for details."
  exit 1
fi

echo "✓ All ports available — safe to run 'docker compose up -d'"
exit 0
