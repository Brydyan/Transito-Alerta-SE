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
