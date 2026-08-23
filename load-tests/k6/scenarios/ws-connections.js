import ws from 'k6/ws';
import { check } from 'k6';
import { thresholds } from '../thresholds.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const ZONE_ID = __ENV.ZONE_ID || 'default';

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
