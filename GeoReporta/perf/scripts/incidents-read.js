import http from 'k6/http';
import { check, sleep } from 'k6';
import { login, authHeaders } from './_auth.js';

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:8000';

// Modest ramp — local dev machine, not a prod-scale rig. Adjust freely.
export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  // admin_sistema: unscoped, sees the full dataset — representative
  // read path regardless of which org's data exists in the environment.
  const token = login(BASE_URL, 'admin@sistema.com', 'Admin123!');
  return { token };
}

export default function (data) {
  const headers = authHeaders(data.token);

  const list = http.get(`${BASE_URL}/api/incidents?per_page=20`, { headers });
  check(list, {
    'list: status 200': (r) => r.status === 200,
    'list: has data array': (r) => Array.isArray(r.json('data')),
  });

  const rows = list.json('data') || [];
  if (rows.length > 0) {
    const pick = rows[Math.floor(Math.random() * rows.length)];
    const detail = http.get(`${BASE_URL}/api/incidents/${pick.id}`, {
      headers,
    });
    check(detail, { 'detail: status 200': (r) => r.status === 200 });
  }

  sleep(1);
}
