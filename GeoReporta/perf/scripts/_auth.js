// Reusable login helper for k6 load tests
import http from 'k6/http';

export function getAuthToken(baseUrl) {
  const loginRes = http.post(`${baseUrl}/api/login`, JSON.stringify({
    email: 'admin@sistema.com',
    password: 'Admin123!',
  }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'login' },
  });

  if (loginRes.status !== 200) {
    console.error(`Login failed: ${loginRes.status}`);
    return null;
  }

  const body = JSON.parse(loginRes.body);
  return body.data?.access_token || body.access_token;
}
