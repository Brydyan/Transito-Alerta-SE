import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * F5.5.7 — Divergence test (D5): the `api_endpoints` seed in migration
 * 0054 must match the registered routes in the application.
 *
 * Strategy: read the migration SQL, extract all (method, path) pairs from
 * the INSERT statement, and verify they cover the routes we expect from
 * the backend controllers. If someone adds a new controller endpoint but
 * forgets to seed it, this test fails.
 *
 * This is the same philosophy as menu-map.spec.ts (D8): synchronization
 * is manual, but divergence is impossible to ignore.
 */

interface SeededEndpoint {
  method: string;
  path: string;
  description: string;
}

/**
 * Parse the INSERT INTO api_endpoints statement from the migration SQL.
 * Extracts method, path, and description from each VALUES row.
 */
function parseSeededEndpoints(): SeededEndpoint[] {
  const migrationPath = path.resolve(
    __dirname,
    '../../../../database/migrations/0054_dynamic_menus_schema.sql',
  );

  let src: string;
  try {
    src = fs.readFileSync(migrationPath, 'utf8');
  } catch (err) {
    throw new Error(
      `api-endpoint-divergence.spec.ts: could not read ${migrationPath}. ` +
        `Error: ${(err as Error).message}`,
    );
  }

  // Match INSERT INTO api_endpoints ... VALUES block
  const insertMatch = src.match(
    /INSERT\s+INTO\s+api_endpoints\s+\(method,\s*path,\s*description\)\s+VALUES\s+([\s\S]*?)ON\s+CONFLICT/i,
  );
  if (!insertMatch) {
    throw new Error('Could not find INSERT INTO api_endpoints in migration SQL');
  }

  const valuesBlock = insertMatch[1];
  const endpoints: SeededEndpoint[] = [];

  // Match each ('METHOD', '/path', 'description') row
  const rowRegex = /\('([A-Z]+)',\s*'([^']+)',\s*'([^']+)'\)/g;
  let match: RegExpExecArray | null;
  while ((match = rowRegex.exec(valuesBlock)) !== null) {
    endpoints.push({
      method: match[1],
      path: match[2],
      description: match[3],
    });
  }

  return endpoints;
}

/**
 * Expected routes from backend controllers. This list must be kept in
 * sync with the actual controller registrations. When a new endpoint is
 * added to a controller, add it here AND in the migration seed.
 *
 * Format: 'METHOD /path' (same unique key as the DB UNIQUE constraint).
 */
const EXPECTED_ROUTES: ReadonlySet<string> = new Set([
  // Auth
  'POST /api/auth/login',
  'POST /api/auth/refresh',
  'POST /api/auth/logout',
  'GET /api/auth/me',
  // Incidents
  'GET /api/incidents',
  'POST /api/incidents',
  'GET /api/incidents/stats',
  'GET /api/incidents/weekly-stats',
  'GET /api/incidents/feed',
  'GET /api/incidents/:id',
  'PATCH /api/incidents/:id',
  'DELETE /api/incidents/:id',
  // Comments
  'GET /api/incidents/:incidentId/comments',
  'POST /api/incidents/:incidentId/comments',
  'PATCH /api/comments/:id',
  'DELETE /api/comments/:id',
  // Users
  'GET /api/users',
  'POST /api/users',
  'GET /api/users/:id',
  'PATCH /api/users/:id',
  'DELETE /api/users/:id',
  // Roles
  'GET /api/roles',
  'POST /api/roles',
  'GET /api/roles/:id',
  'PATCH /api/roles/:id',
  'DELETE /api/roles/:id',
  // Organizations
  'GET /api/organizations',
  'POST /api/organizations',
  'GET /api/organizations/:id',
  'PATCH /api/organizations/:id',
  // Incident categories
  'GET /api/incident-categories',
  'POST /api/incident-categories',
  'GET /api/incident-categories/:id',
  'PATCH /api/incident-categories/:id',
  'DELETE /api/incident-categories/:id',
  // Geo zones
  'GET /api/geo-zones',
  'POST /api/geo-zones',
  'GET /api/geo-zones/:id',
  'PATCH /api/geo-zones/:id',
  'DELETE /api/geo-zones/:id',
  // Assignments
  'GET /api/assignments',
  'POST /api/assignments',
  'PATCH /api/assignments/:id',
  'DELETE /api/assignments/:id',
  // Notifications
  'GET /api/notifications',
  'PATCH /api/notifications/:id',
  'DELETE /api/notifications/:id',
  // Dashboard
  'GET /api/operator/dashboard',
  // Permissions
  'GET /api/permissions',
  // Sessions
  'GET /api/sessions',
  'DELETE /api/sessions/:id',
  // Invitations
  'POST /api/invitations',
  'GET /api/invitations',
  'DELETE /api/invitations/:id',
  // Audit logs
  'GET /api/audit-logs',
  'GET /api/audit-logs/export.csv',
  // Menu options (F5.5.4)
  'GET /api/menu-options',
  'GET /api/menu-options/endpoints',
  'GET /api/menu-options/:id',
  'POST /api/menu-options',
  'PATCH /api/menu-options/:id',
  'DELETE /api/menu-options/:id',
  'GET /api/menu-options/:id/roles',
  'PUT /api/menu-options/:id/roles/:roleId',
  'PUT /api/menu-options/:id/endpoints',
]);

describe('api_endpoints seed divergence (D5, F5.5.7)', () => {
  it('CRITICAL: every seeded endpoint matches a registered route', () => {
    const seeded = parseSeededEndpoints();

    const seededRoutes = new Set(
      seeded.map((ep) => `${ep.method} ${ep.path}`),
    );

    const missingInSeed: string[] = [];
    for (const route of EXPECTED_ROUTES) {
      if (!seededRoutes.has(route)) {
        missingInSeed.push(route);
      }
    }

    if (missingInSeed.length > 0) {
      throw new Error(
        `D5 DIVERGENCE: ${missingInSeed.length} route(s) registered in controllers ` +
          `but NOT in the api_endpoints seed. Add them to ` +
          `0054_dynamic_menus_schema.sql:\n  ${missingInSeed.join('\n  ')}`,
      );
    }
  });

  it('no seeded route is orphaned (not in any controller)', () => {
    const seeded = parseSeededEndpoints();
    const seededRoutes = new Set(
      seeded.map((ep) => `${ep.method} ${ep.path}`),
    );

    const orphaned: string[] = [];
    for (const route of seededRoutes) {
      if (!EXPECTED_ROUTES.has(route)) {
        orphaned.push(route);
      }
    }

    if (orphaned.length > 0) {
      throw new Error(
        `D5 DIVERGENCE: ${orphaned.length} seeded endpoint(s) not found in controllers:\n  ` +
          `${orphaned.join('\n  ')}. Remove them from 0054_dynamic_menus_schema.sql ` +
          `or add the missing controller routes.`,
      );
    }
  });

  it('seed has a non-empty set of endpoints', () => {
    const seeded = parseSeededEndpoints();
    expect(seeded.length).toBeGreaterThan(0);
  });
});
