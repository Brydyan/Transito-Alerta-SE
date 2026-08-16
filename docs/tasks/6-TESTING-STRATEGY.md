# 6: Estrategia de Testing — Unit + E2E + Load

## Pirámide de Pruebas

```
           ▲
          ╱ ╲
         ╱   ╲  Load Testing (k6/Artillery)
        ╱─────╲ 5% esfuerzo, crítico para 25k usuarios
       ╱       ╲
      ╱─────────╲  E2E Integration (Testcontainers)
     ╱           ╲ 15% esfuerzo, 4 workflows + regresiones
    ╱─────────────╲  
   ╱               ╲ Unit Tests (Jest/Vitest)
  ╱─────────────────╲ 80% esfuerzo, 70%+ cobertura
 ╱___________________ ╲
```

## Backend: Jest + Testcontainers

### Unit Tests (Jest)
**Convención**: `*.service.spec.ts`, `*.controller.spec.ts`  
**Patrón**: Arrange-Act-Assert, 3 bloques describe (carga de módulo, métodos de servicio, rutas de controller)  
**Mocks**: Mock Redis, mock repositorios, spy en eventEmitter2  
**Objetivo de Cobertura**: 70%+ por módulo  

**Escenarios de Prueba Clave**:
- Happy path (entrada válida → respuesta exitosa)
- Permiso denegado (permiso faltante → 403, sin mutación de BD)
- Error de validación (entrada inválida → 400, mensaje de validación)
- No encontrado (ID de recurso faltante → 404)
- Conflicto (double-claim de incident → 409 Conflict)
- Eventos async (service.create emite evento stream → aserción XADD llamado)

### E2E Integration (Testcontainers)
**Convención**: `*.e2e-spec.ts`  
**Infraestructura**: Postgres real + PostGIS 3.4, Redis 7 real, boot app NestJS real  
**Patrón**: Supertest para HTTP, socket.io-client para WebSockets, XREAD para Redis Streams

**4 Workflows Principales**:
1. **Citizen Report** (Creación de Incident Anónima)
   - Login anónimo → device_uuid JWT
   - POST /api/incidents {title, location, priority}
   - Aserción geofence match (Santa Elena)
   - Aserción evento incident:created en Redis Streams
   - Aserción broadcast socket.io a sala geo:{zone_id}

2. **Enforcement de Techo Anónimo**
   - Usuario anónimo puede READ/CREATE incidents, CREATE comments
   - Usuario anónimo NO PUEDE UPDATE incidents, DELETE comments, ASSIGN incidents
   - Cada endpoint de mutación retorna 403 para permiso faltante

3. **Asignación + Conflicto**
   - Operator reclama incident (PUT /api/assignments)
   - Segundo operator intenta reclamar mismo incident → 409 Conflict
   - Claim del primer operator persiste

4. **Ciclo de Vida de Status**
   - Crear incident (status: pending)
   - PATCH status → in_progress → aserción purga de caché (geo:tags:{zone_id})
   - PATCH status → resolved → aserción fila de auditoría StatusHistory
   - Aserción evento incident:status_changed en stream

**9 Regresión Tests** (de defectos Phase 1-2):
- Identidad JwtStrategy (user.id vs device_uuid) ✅
- Resolución de permisos EventsGateway ✅
- Casing de respuesta (snake_case) ✅
- Desenvuelve de tupla UPDATE...RETURNING ✅
- Rate limiter por identidad de dispositivo ✅
- Activación de caché de geofencing ✅
- Purga cross-database (DB0 vs DB1) ✅
- Limpieza pub/sub RedisIoAdapter ✅
- Silencio de shutdown consumidor Streams ✅

### Ejecutar Pruebas

```bash
# Unit tests (rápido, mockeado)
pnpm run test

# Unit tests modo watch
pnpm run test:watch

# Reporte de cobertura unit
pnpm run test:coverage

# E2E tests (lento, infraestructura real)
pnpm run test:e2e

# Suite E2E específica
pnpm run test:e2e -- mail.e2e-spec.ts
```

## Frontend: Vitest + Playwright

### Vitest (Unit Tests)
**Convención**: `*.test.js`, excluye `*.integration.test.js` y `*.snapshot.test.js`  
**Objetivo**: 70%+ cobertura en servicios principales (authService, httpService, route guards)  
**Patrones**: Mock fetch, mock localStorage, pruebas de guards de permiso

### Playwright (E2E)
**Config**: `playwright.config.mobile.js` para testing de móvil  
**Escenarios**:
- Flujo de login (anónimo → device_uuid → JWT almacenado en sessionStorage)
- Creación de incident (llenar form, enviar, aserción mensaje de éxito)
- Notificación en tiempo real (crear incident, evento socket recibido, UI actualizada)
- Enforcement de permisos (permiso faltante → botón deshabilitado o error 403)

## Load Testing (k6 o Artillery)

### Métricas Objetivo
- **Usuarios Concurrentes**: 25,000
- **Sockets por Instancia**: ~5,000 (conexiones socket.io)
- **Latencia**: p95 < 200ms (creación de incident + búsqueda de geofencing)
- **Throughput**: 1,000 incidents/minuto
- **Tasa de Error**: < 0.1% (mostly 429 rate limit, aceptable)

### Escenarios
1. **Ramp-Up**: Conectar gradualmente 25k usuarios en 10 minutos
2. **Sustained Load**: Mantener 15 minutos, medir distribución de latencia
3. **Spikes**: Aumento súbito de 50% en tráfico, observar recuperación
4. **Stress**: Empujar más allá de 25k hasta primer fallo crítico, documentar breaking point

### Ejemplo Script (k6)
```javascript
import http from 'k6/http';
import ws from 'k6/ws';

export const options = {
  stages: [
    { duration: '10m', target: 25000 }, // Ramp-up
    { duration: '15m', target: 25000 }, // Sustain
    { duration: '5m', target: 0 },      // Ramp-down
  ],
};

export default () => {
  // Login
  const jwt = http.post(`${API_URL}/auth/login`, { device_uuid }).body;
  
  // Create incident
  http.post(`${API_URL}/incidents`, {
    title: 'Pothole',
    location: { lat: -2.2, lng: -80.5 },
    priority: 'low',
  }, { headers: { Authorization: `Bearer ${jwt}` } });
  
  // WebSocket
  ws.connect(`${WS_URL}`, (socket) => {
    socket.on('open', () => socket.send(JSON.stringify({ join: 'geo:zone123' })));
  });
};
```

## Security Testing

### Regresión SQL Injection
- Todas las consultas parametrizadas (sin concat de string crudo fuera de GeofencingService)
- Test: intentar `'; DROP TABLE incidents; --` en título de incident → almacenado como string literal, no ejecutado

### Rate Limiting
- Verificar bucket por device_uuid (no global)
- Test: 2 dispositivos agotando límite de 3-request/min → uno falla, otro sucede

### Validación CORS
- Verificar orígenes no en allowlist son rechazados
- Test: fetch desde `https://attacker.com` → 403 error CORS

## Criterios de Éxito

- [ ] 200+ suites de prueba, 1000+ pruebas totales
- [ ] 70%+ cobertura backend (por módulo)
- [ ] Todos los 4 workflows principales pasando E2E
- [ ] Todas las 9 regresiones pasando
- [ ] Load test: 25k usuarios concurrentes, p95 < 200ms sostenido
- [ ] Cero regresión de seguridad (SQL injection, CORS, rate limiting)
- [ ] CI pasa en cada PR (GitHub Actions)
