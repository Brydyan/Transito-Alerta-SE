## 🔵 PASO 5: Validar Fixes con k6

### 5a. Ejecutar test k6
```bash
cd /home/andy/Escritorio/PROYECTOS/INTEGRADOR/sistema-incidencias-georreferenciadas

docker run --rm --network host \
  -v "$(pwd)/perf/scripts:/app" \
  -e API_BASE_URL="http://localhost:8000" \
  grafana/k6:latest run /app/load-test-complete.js --vus 50 --duration 2m 2>&1 | tail -60
```

### 5b. Capturar resultados
Buscar al final:
```
http_req_duration
✓ 'p(95)<800' p(95)=XXXms
✓ 'p(99)<1500' p(99)=XXXms

http_req_failed
✓ 'rate<0.05' rate=0.00%
```

### 5c. Interpretación

| p(95) | Resultado | Acción |
|---|---|---|
| **< 500ms** | ✅ EXCELENTE | Demo ready |
| **500-1000ms** | 🟡 BUENO | Aceptable, optimizaciones futuras |
| **> 1000ms** | 🔴 REVISAR | Re-check pasos 1-4 |

