import http from 'k6/http';
import { check, sleep } from 'k6';
import { login, authHeaders } from './_auth.js';

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:8000';

// Marker so generated rows are identifiable and disposable — same
// convention as SantaElenaIncidentSeeder's TITLE_PREFIX. Local dev only;
// never point this script at staging/prod. Clean up afterward with:
//   DELETE FROM incidents WHERE title LIKE '[k6-loadtest]%';
const TITLE_PREFIX = '[k6-loadtest]';

export const options = {
  stages: [
    { duration: '20s', target: 5 },
    { duration: '40s', target: 5 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

function findLeafCategoryId(nodes) {
  for (const node of nodes) {
    const children = node.children || [];
    if (children.length === 0) return node.id;
    const found = findLeafCategoryId(children);
    if (found) return found;
  }
  return null;
}

export function setup() {
  const token = login(BASE_URL, 'admin@sistema.com', 'Admin123!');
  const headers = authHeaders(token);

  const catRes = http.get(`${BASE_URL}/api/incident-categories/tree`, {
    headers,
  });
  const categoryId = findLeafCategoryId(catRes.json('data') || []);

  const locRes = http.get(`${BASE_URL}/api/locations?level=city&per_page=1`, { headers });
  const locationId = (locRes.json('data') || [])[0]?.id ?? null;

  if (!categoryId || !locationId) {
    throw new Error(
      'setup: could not resolve a leaf category id or a city location id ' +
        '— is the environment seeded? (php artisan db:seed)',
    );
  }

  return { token, categoryId, locationId };
}

export default function (data) {
  const headers = authHeaders(data.token);
  const uniqueSuffix = `VU${__VU}-iter${__ITER}-${Date.now()}`;

  const payload = JSON.stringify({
    title: `${TITLE_PREFIX} carga ${uniqueSuffix}`,
    description: 'Generado por k6 incidents-write.js — seguro de borrar.',
    priority: 'low',
    incident_category_id: data.categoryId,
    location_id: data.locationId,
    // geom is validated as a JSON *string* field (StoreIncidentRequest:
    // 'geom' => 'nullable|json'), not a nested object — matches
    // IncidentController::store's is_string($data['geom']) decode step.
    geom: JSON.stringify({
      type: 'Point',
      // Quito, jittered so generated points don't all stack on one pixel.
      coordinates: [
        -78.5249 + (Math.random() - 0.5) / 100,
        -0.2295 + (Math.random() - 0.5) / 100,
      ],
    }),
  });

  const res = http.post(`${BASE_URL}/api/incidents`, payload, { headers });
  check(res, {
    'create: status 201': (r) => r.status === 201,
  });

  sleep(1);
}
