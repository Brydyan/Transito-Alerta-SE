# Design: T4.2 Load Testing — k6

**Change**: t4.2-load-testing  
**Date**: 2026-08-22  

---

## Decisiones técnicas

### D1 — k6 sobre Artillery

Artillery descartado: su plugin WebSocket no maneja el handshake de socket.io v4 (EIO=4).
k6 tiene soporte nativo de WebSocket (`k6/ws`) y permite forzar `transport=websocket`
en la query string, bypaseando el polling upgrade que Artillery no puede negociar.

### D2 — Forced WebSocket transport para socket.io

socket.io v4 inicia con HTTP long-polling antes de hacer upgrade a WebSocket.
k6/ws no simula navegador — no puede manejar el polling inicial.

Solución: conectar directamente al endpoint WS con `?EIO=4&transport=websocket`:
```
ws://HOST/socket.io/?EIO=4&transport=websocket
```

Esto es válido porque el servidor socket.io acepta conexiones WS directas si el
cliente declara explícitamente `transport=websocket`. El flujo auth del backend
(join room requiere JWT) se omite en este escenario — se mide solo el costo de
conexión y protocolo, no el de autorización de sala.

### D3 — Thresholds centralizados en thresholds.js

Los 3 escenarios importan el mismo objeto `{ thresholds }`. Ventaja: cambiar la
barra de aceptación una vez en `thresholds.js` afecta todos los escenarios.
No se duplican valores.

```js
// thresholds.js
export const thresholds = {
  http_req_duration: ['p(95)<200'],
  http_req_failed:   ['rate<0.001'],
  ws_connecting:     ['p(95)<500'],
};
```

### D4 — BASE_URL via `__ENV`

Todos los scripts leen `__ENV.BASE_URL || 'http://localhost:3001'`.
Permite apuntar a staging sin modificar código:
```bash
k6 run -e BASE_URL=http://192.168.1.100:3004 scenarios/auth-login.js
```

### D5 — device_uuid por VU para auth-login

`POST /api/auth/login` requiere `device_uuid`. En carga se genera uno por VU:
`device-${__VU}`. Esto evita colisiones de sesión entre VUs y replica el patrón
real de un dispositivo móvil único por usuario.

### D6 — Sin setup() para incidents-read

`GET /api/incidents` acepta peticiones anónimas (scope `public`, T3.2). No se
necesita login previo ni token. Simplifica el escenario y mide el caso más
frecuente: el feed ciudadano.

### D7 — docker-compose.k6.yml separado del compose.yaml principal

El stack k6+InfluxDB+Grafana es solo para visualización local de runs manuales.
Separarlo evita que `docker compose up` en dev levante servicios de monitoreo
innecesarios. El archivo vive en `load-tests/` junto con los scripts.

---

## Estructura de archivos

```
load-tests/
  k6/
    scenarios/
      auth-login.js        # POST /api/auth/login, 25k VUs, ramping 0→25k en 2m
      incidents-read.js    # GET /api/incidents (anónimo), 25k VUs
      ws-connections.js    # WebSocket forced transport, 5k sockets simultáneos
    thresholds.js          # Exporta { thresholds } compartido
    README.md              # Instrucciones: instalar k6, correr, variable BASE_URL
  docker-compose.k6.yml    # k6 + InfluxDB v1.8 + Grafana (visualización, no CI)
```

---

## Contratos de cada script

### auth-login.js

```js
import http from 'k6/http';
import { check } from 'k6';
import { thresholds } from '../thresholds.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export const options = {
  scenarios: {
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 25000 },
        { duration: '3m', target: 25000 },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds,
};

export default function () {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ device_uuid: `load-test-${__VU}` }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, { 'status 200': (r) => r.status === 200 });
}
```

### incidents-read.js

```js
import http from 'k6/http';
import { check } from 'k6';
import { thresholds } from '../thresholds.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export const options = {
  scenarios: {
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 25000 },
        { duration: '3m', target: 25000 },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds,
};

export default function () {
  const res = http.get(`${BASE_URL}/api/incidents`);
  check(res, { 'status 200': (r) => r.status === 200 });
}
```

### ws-connections.js

```js
import ws from 'k6/ws';
import { check } from 'k6';
import { thresholds } from '../thresholds.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const ZONE_ID  = __ENV.ZONE_ID  || 'default';

// Convertir http→ws para el host base
const WS_HOST = BASE_URL.replace(/^https?/, 'ws');

export const options = {
  scenarios: {
    ws_load: {
      executor: 'constant-vus',
      vus: 5000,
      duration: '2m',
    },
  },
  thresholds: {
    ws_connecting: thresholds.ws_connecting,
  },
};

export default function () {
  const url = `${WS_HOST}/socket.io/?EIO=4&transport=websocket`;

  const res = ws.connect(url, {}, (socket) => {
    socket.on('open', () => {
      // socket.io v4: enviar "2probe" como ping EIO
      socket.send('2probe');
    });
    socket.on('message', (msg) => {
      // EIO "3probe" = pong, responder con "5" (upgrade)
      if (msg === '3probe') socket.send('5');
    });
    // Hold connection 30s
    socket.setTimeout(() => socket.close(), 30_000);
  });

  check(res, { 'connected': (r) => r && r.status === 101 });
}
```

### docker-compose.k6.yml (estructura)

```yaml
services:
  influxdb:
    image: influxdb:1.8
    ports: ["8086:8086"]

  grafana:
    image: grafana/grafana:latest
    ports: ["3100:3000"]
    depends_on: [influxdb]

  k6:
    image: grafana/k6:latest
    volumes:
      - ./k6:/scripts
    environment:
      K6_OUT: influxdb=http://influxdb:8086/k6
    # Comando: docker compose -f docker-compose.k6.yml run k6 run /scripts/scenarios/auth-login.js
```

---

## Endpoints bajo prueba

| Escenario | Método | Ruta | Auth requerida |
|-----------|--------|------|----------------|
| auth-login | POST | `/api/auth/login` | No (es el login) |
| incidents-read | GET | `/api/incidents` | No (público, T3.2) |
| ws-connections | WS | `/socket.io/?EIO=4&transport=websocket` | No (mide costo de conexión) |

---

## Notas de ejecución

- Los scripts requieren **k6 ≥ v0.52** (soporte ES modules para `import`)
- Para el escenario de 25k VUs se recomienda mínimo 4 cores y 8GB RAM en la máquina de prueba
- El backend local debe correr con `docker compose up -d postgres redis` + `pnpm run start:dev`
- O apuntar directamente al staging con `BASE_URL=http://SERVER:3004`
