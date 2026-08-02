import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { getAuthToken } from './_auth.js';

const BASE_URL = __ENV.API_BASE_URL || 'https://api2.dihm-muertos.site';

export const options = {
  stages: [
    { duration: '1m', target: 1 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<200', 'p(99)<300'],
    'http_req_failed': ['rate<0.01'],
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
  group('Smoke Test — Health', () => {
    const res = http.get(`${BASE_URL}/api/health`);
    check(res, {
      'status 200': (r) => r.status === 200,
      'latency <200ms': (r) => r.timings.duration < 200,
    });
  });

  group('Smoke Test — Feed', () => {
    const res = http.get(`${BASE_URL}/api/incidents?per_page=10`, {
      headers: { 'Authorization': `Bearer ${token}` },
      tags: { name: 'get_incidents' },
    });
    check(res, {
      'status 200': (r) => r.status === 200,
      'latency <300ms': (r) => r.timings.duration < 300,
    });
  });

  sleep(1);
}
