// Shared k6 thresholds — single source of truth for all 3 scenarios.
// Change here once, all scenarios reflect the new bar.

export const thresholds = {
  http_req_duration: ['p(95)<200'],
  http_req_failed: ['rate<0.001'],
  ws_connecting: ['p(95)<500'],
};
