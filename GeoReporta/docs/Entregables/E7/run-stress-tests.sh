#!/bin/bash
# =====================================================
# Hito 7 - Stress Testing Execution Script
# =====================================================
# Uso: bash docs/E7/run-stress-tests.sh [smoke|read|write|mixed|all]
#
# Requisitos:
# - k6 instalado: https://k6.io/docs/getting-started/installation/
# - Backend corriendo en localhost:8000
# - Base de datos seeded
# =====================================================

set -e

BASE_URL="${API_BASE_URL:-http://localhost:8000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PERF_DIR="$(dirname "$SCRIPT_DIR")/perf/scripts"
OUTPUT_DIR="$SCRIPT_DIR/results"

mkdir -p "$OUTPUT_DIR"

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Verificar dependencias
check_dependencies() {
    log_info "Verificando dependencias..."
    
    if ! command -v k6 &> /dev/null; then
        log_error "k6 no está instalado. Instalar: https://k6.io/docs/getting-started/installation/"
        exit 1
    fi
    
    if ! curl -s "$BASE_URL/api/health" > /dev/null 2>&1; then
        log_error "Backend no disponible en $BASE_URL"
        log_info "Iniciar con: cd backend && php artisan serve"
        exit 1
    fi
    
    log_info "Dependencias OK"
}

# Ejecutar smoke test
run_smoke() {
    log_info "Ejecutando Smoke Test..."
    k6 run "$PERF_DIR/smoke.js" \
        --env API_BASE_URL="$BASE_URL" \
        --out json="$OUTPUT_DIR/smoke-results.json" \
        --summary-export="$OUTPUT_DIR/smoke-summary.json"
    log_info "Smoke test completado → $OUTPUT_DIR/smoke-results.json"
}

# Ejecutar read-heavy test
run_read() {
    log_info "Ejecutando Read-Heavy Test (50 VUs)..."
    k6 run "$PERF_DIR/incidents-read.js" \
        --env API_BASE_URL="$BASE_URL" \
        --out json="$OUTPUT_DIR/read-results.json" \
        --summary-export="$OUTPUT_DIR/read-summary.json"
    log_info "Read test completado → $OUTPUT_DIR/read-results.json"
}

# Ejecutar write-heavy test
run_write() {
    log_info "Ejecutando Write-Heavy Test (20 VUs)..."
    k6 run "$PERF_DIR/incidents-write.js" \
        --env API_BASE_URL="$BASE_URL" \
        --out json="$OUTPUT_DIR/write-results.json" \
        --summary-export="$OUTPUT_DIR/write-summary.json"
    log_info "Write test completado → $OUTPUT_DIR/write-results.json"
}

# Generar reporte HTML
generate_report() {
    log_info "Generando reporte HTML..."
    
    # Este script generaría un reporte desde los JSON results
    # Por ahora copiamos el dashboard template
    cp "$SCRIPT_DIR/DASHBOARD_E7.html" "$OUTPUT_DIR/dashboard.html"
    
    log_info "Reporte generado → $OUTPUT_DIR/dashboard.html"
}

# Mostrar uso
usage() {
    echo "Uso: $0 [smoke|read|write|mixed|all]"
    echo ""
    echo "Escenarios:"
    echo "  smoke    - Smoke test básico (1 VU, 10 iteraciones)"
    echo "  read     - Read-heavy test (10-50 VUs)"
    echo "  write    - Write-heavy test (5-20 VUs)"
    echo "  mixed    - Test mixto (15-25 VUs, 50/50 read/write)"
    echo "  all      - Ejecutar todos los escenarios"
    echo ""
    echo "Variables de entorno:"
    echo "  API_BASE_URL    URL del backend (default: http://localhost:8000)"
    echo ""
    echo "Ejemplos:"
    echo "  $0 smoke"
    echo "  API_BASE_URL=http://staging:8000 $0 all"
}

# Main
case "${1:-all}" in
    smoke)
        check_dependencies
        run_smoke
        generate_report
        ;;
    read)
        check_dependencies
        run_read
        generate_report
        ;;
    write)
        check_dependencies
        run_write
        generate_report
        ;;
    mixed)
        check_dependencies
        k6 run "$PERF_DIR/load-test-complete.js" \
            --env API_BASE_URL="$BASE_URL" \
            --out json="$OUTPUT_DIR/mixed-results.json"
        generate_report
        ;;
    all)
        check_dependencies
        log_info "Ejecutando suite completa de stress tests..."
        run_smoke
        run_read
        run_write
        generate_report
        log_info "Suite completa finalizada"
        ;;
    help|--help|-h)
        usage
        exit 0
        ;;
    *)
        log_error "Escenario desconocido: $1"
        usage
        exit 1
        ;;
esac

log_info "Resultados en: $OUTPUT_DIR/"
