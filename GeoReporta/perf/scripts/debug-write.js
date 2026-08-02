import http from 'k6/http';
import { check } from 'k6';
import { getAuthToken } from './_auth.js';

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:8000';

export let options = {
  vus: 1,
  duration: '10s',
  thresholds: {},
};

export default function () {
  const token = getAuthToken(BASE_URL);
  if (!token) {
    console.error('No auth token obtained');
    return;
  }

  // Single create incident request
  let res = http.post(`${BASE_URL}/api/incidents`, JSON.stringify({
    title: `Test Incident Debug`,
    description: 'Debug write test',
    incident_category_id: 1,
    location_id: 1,
    priority: 'medium',
  }), {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  console.log(`Status: ${res.status}`);
  console.log(`Body: ${res.body}`);
  console.log(`Timing: ${res.timings.duration}ms`);

  check(res, {
    'status 201': (r) => r.status === 201,
  });
}
