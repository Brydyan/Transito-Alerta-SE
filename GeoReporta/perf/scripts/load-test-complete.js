import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { getAuthToken } from './_auth.js';

const BASE_URL = __ENV.API_BASE_URL || 'https://api2.dihm-muertos.site';

export const options = {
  scenarios: {
    read_heavy: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '60s', target: 50 },
        { duration: '30s', target: 0 },
      ],
      exec: 'read',
      tags: { scenario: 'read' },
    },
    write_heavy: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 20 },
        { duration: '60s', target: 20 },
        { duration: '20s', target: 0 },
      ],
      exec: 'write',
      tags: { scenario: 'write' },
    },
    mixed: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 25 },
        { duration: '90s', target: 25 },
        { duration: '30s', target: 0 },
      ],
      exec: 'mixed',
      tags: { scenario: 'mixed' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.95'],
  },
};

function findLeafCategoryId(nodes) {
  for (const node of nodes) {
    const children = node.children || [];
    if (children.length === 0 && node.organization_id !== null) {
      return node.id;
    }
    const found = findLeafCategoryId(children);
    if (found) {
      return found;
    }
  }
  return null;
}

export function setup() {
  const token = getAuthToken(BASE_URL);
  if (!token) {
    throw new Error('Authentication failed during setup');
  }

  const params = {
    headers: { Authorization: `Bearer ${token}` },
  };
  const catsRes = http.get(`${BASE_URL}/api/incident-categories/tree`, params);
  const locsRes = http.get(`${BASE_URL}/api/locations?level=city&per_page=1`, params);

  if (catsRes.status !== 200) {
    throw new Error(`Failed to fetch categories: HTTP ${catsRes.status}`);
  }
  if (locsRes.status !== 200) {
    throw new Error(`Failed to fetch locations: HTTP ${locsRes.status}`);
  }

  const categoryId = findLeafCategoryId(JSON.parse(catsRes.body).data || []);
  const locationId = (JSON.parse(locsRes.body).data || [])[0]?.id ?? null;

  if (!categoryId) {
    throw new Error('No organization leaf categories found');
  }
  if (!locationId) {
    throw new Error('No city locations found');
  }

  return { token, categoryId, locationId };
}

export function read({ token }) {
  const rand = Math.random();

  if (rand < 0.6) {
    group('read:incidents', () => {
      const res = http.get(`${BASE_URL}/api/incidents?per_page=20`, {
        headers: { Authorization: `Bearer ${token}` },
        tags: { name: 'get_incidents' },
      });
      check(res, {
        'status 200': (response) => response.status === 200,
        'p95 <500ms': (response) => response.timings.duration < 500,
      });
    });
  } else if (rand < 0.8) {
    group('read:categories', () => {
      const res = http.get(`${BASE_URL}/api/incident-categories`, {
        headers: { Authorization: `Bearer ${token}` },
        tags: { name: 'get_categories' },
      });
      check(res, {
        'status 200': (response) => response.status === 200,
      });
    });
  } else {
    group('read:locations', () => {
      const res = http.get(`${BASE_URL}/api/locations`, {
        headers: { Authorization: `Bearer ${token}` },
        tags: { name: 'get_locations' },
      });
      check(res, {
        'status 200': (response) => response.status === 200,
      });
    });
  }

  sleep(1);
}

export function write({ token, categoryId, locationId }) {
  group('write:create_incident', () => {
    const res = http.post(`${BASE_URL}/api/incidents`, JSON.stringify({
      title: `Load Test Incident ${__VU}-${__ITER}-${Date.now()}`,
      description: 'k6 load test incident',
      incident_category_id: categoryId,
      location_id: locationId,
      priority: 'medium',
    }), {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      tags: { name: 'create_incident' },
    });
    check(res, {
      'status 201': (response) => response.status === 201,
      'p95 <1000ms': (response) => response.timings.duration < 1000,
    });
  });

  sleep(1);
}

export function mixed({ token, categoryId, locationId }) {
  if (Math.random() < 0.7) {
    group('mixed:read', () => {
      const res = http.get(`${BASE_URL}/api/incidents?per_page=20`, {
        headers: { Authorization: `Bearer ${token}` },
        tags: { name: 'mixed_read' },
      });
      check(res, {
        'status 200': (response) => response.status === 200,
      });
    });
  } else {
    group('mixed:write', () => {
      const res = http.post(`${BASE_URL}/api/incidents`, JSON.stringify({
        title: `Mixed Incident ${__VU}-${__ITER}-${Date.now()}`,
        description: 'Mixed load test',
        incident_category_id: categoryId,
        location_id: locationId,
        priority: 'low',
      }), {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        tags: { name: 'mixed_write' },
      });
      check(res, {
        'status 201': (response) => response.status === 201,
      });
    });
  }

  sleep(1);
}
