#!/usr/bin/env bash
# init.sh — Verificación e inicialización del entorno
#
# Salida esperada: códigos de salida claros y bloques marcados con [OK]/[FAIL].

set -u
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

ok()    { printf "${GREEN}[OK]${NC}    %s\n" "$1"; }
warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$1"; }
fail()  { printf "${RED}[FAIL]${NC}  %s\n" "$1"; }

EXIT_CODE=0

echo "── 1. Verificando entorno (Node.js/NestJS/Angular) ──"

if ! command -v node >/dev/null 2>&1; then
  fail "node no está instalado"
  exit 1
fi
ok "node -> $(node -v)"

if ! command -v npm >/dev/null 2>&1; then
  fail "npm no está instalado"
  exit 1
fi
ok "npm -> $(npm -v)"

if ! command -v nest >/dev/null 2>&1; then
  warn "nest CLI no está disponible globalmente (se puede usar npx)"
else
  ok "nest -> $(nest --version 2>/dev/null || echo 'encontrado')"
fi

if ! command -v ng >/dev/null 2>&1; then
  warn "ng CLI no está disponible globalmente (se puede usar npx)"
else
  ok "ng CLI encontrado"
fi

echo ""
echo "── 2. Verificando archivos base del arnés ──────────────"

for f in AGENTS.md feature_list.json progress/current.md docs/sdd/architecture.md docs/sdd/conventions.md docs/sdd/verification.md CHECKPOINTS.md; do
  if [ ! -f "$f" ]; then
    fail "Falta archivo base: $f"
    EXIT_CODE=1
  else
    ok "Existe $f"
  fi
done

echo ""
echo "── 3. Validando feature_list.json y specs ─────────────"

PYTHON_BIN=""
if command -v python3 >/dev/null 2>&1 && python3 -c "import sys" >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1 && python -c "import sys" >/dev/null 2>&1; then
  PYTHON_BIN="python"
elif command -v py >/dev/null 2>&1 && py -c "import sys" >/dev/null 2>&1; then
  PYTHON_BIN="py"
fi

if [ -n "$PYTHON_BIN" ]; then
$PYTHON_BIN - <<'PY'
import json, os, sys
try:
    if not os.path.exists("feature_list.json"):
        sys.exit(0)
    data = json.load(open("feature_list.json"))
    valid = {"pending", "spec_ready", "in_progress", "done", "blocked"}
    in_progress = [f for f in data["features"] if f["status"] == "in_progress"]
    if len(in_progress) > 1:
        print(f"[FAIL]  Hay {len(in_progress)} features en in_progress (máximo 1)")
        sys.exit(1)
    requires_spec = {"spec_ready", "in_progress", "done"}
    spec_errors = []
    for f in data["features"]:
        if f["status"] not in valid:
            print(f"[FAIL]  Estado inválido en feature {f['id']}: {f['status']}")
            sys.exit(1)
        if f.get("sdd") and f["status"] in requires_spec:
            spec_dir = os.path.join("specs", f["name"])
            for fname in ("requirements.md", "design.md", "tasks.md"):
                if not os.path.isfile(os.path.join(spec_dir, fname)):
                    spec_errors.append(
                        f"feature {f['id']} ({f['name']}) en {f['status']} "
                        f"sin {spec_dir}/{fname}"
                    )
    if spec_errors:
        for e in spec_errors:
            print(f"[FAIL]  {e}")
        sys.exit(1)
    print(f"[OK]    feature_list.json válido ({len(data['features'])} features)")
    print(f"[OK]    Specs presentes para features sdd con estado no-pending")
except SystemExit:
    raise
except Exception as e:
    print(f"[FAIL]  feature_list.json o specs inválidos: {e}")
    sys.exit(1)
PY
if [ $? -ne 0 ]; then EXIT_CODE=1; fi
else
    warn "python3 no encontrado, no se puede validar feature_list.json (opcional)"
fi

echo ""
echo "── 4. Ejecutando tests (NestJS & Angular) ──────────────"

TESTS_RAN=0

if [ -d "backend" ] && [ -f "backend/package.json" ]; then
  TESTS_RAN=1
  cd backend
  if npm test >/dev/null 2>&1; then
    ok "Todos los tests de NestJS (backend) pasan"
  else
    fail "Hay tests de NestJS rotos. Ejecuta 'npm test' en backend/ para ver el detalle."
    EXIT_CODE=1
  fi
  cd ..
fi

if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then
  TESTS_RAN=1
  cd frontend
  if npm test -- --watch=false >/dev/null 2>&1; then
    ok "Todos los tests de Angular (frontend) pasan"
  else
    fail "Hay tests de Angular rotos. Ejecuta 'npm test' en frontend/ para ver el detalle."
    EXIT_CODE=1
  fi
  cd ..
fi

if [ $TESTS_RAN -eq 0 ]; then
  warn "Carpetas backend/ o frontend/ no existen o no contienen package.json"
fi

echo ""
echo "── 5. Resumen ──────────────────────────────────────────"

if [ $EXIT_CODE -eq 0 ]; then
  ok "Entorno listo. Puedes empezar a trabajar."
else
  fail "Entorno NO está listo. Resuelve los errores antes de avanzar."
fi

exit $EXIT_CODE
