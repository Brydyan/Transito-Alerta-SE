import http from 'k6/http';
import { check } from 'k6';
import { getAuthToken } from './_auth.js';

const BASE_URL = __ENV.API_BASE_URL || 'https://api2.dihm-muertos.site';

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '60s', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],
    'http_req_failed': ['rate<0.05'],
  },
};

export function setup() {
  const token = getAuthToken(BASE_URL);
  if (!token) {
    throw new Error('Authentication failed during setup');
  }

  return { token };
}

export default function ({ token }) {
  const res = http.get(`${BASE_URL}/api/incidents?per_page=20`, {
    headers: { 'Authorization': `Bearer ${token}` },
    tags: { name: 'get_incidents' },
  });

  check(res, {
    'status 200': (r) => r.status === 200,
    'p95 <500ms': (r) => r.timings.duration < 500,
  });
}
