# E2E Test Suite — Cypress

End-to-end tests covering 22+ critical user journeys.

## Quick Start

### Prerequisites
- Docker running (frontend @ `http://localhost:3000`, backend @ `http://localhost:8000/api`)
- `npm install` completed in `frontend/`

### Run Tests (Headless)
```bash
npm run test:e2e
```

### Run Tests (Interactive)
```bash
npm run test:e2e:dev
```
Opens Cypress UI. Select spec file to watch/debug.

## Test Organization

### Test Files (7 suites, 22 tests)

**Auth (3 tests)**
- `auth.cy.js`: Login, login failure, logout

**Incidents CRUD (4 tests)**
- `incidents.cy.js`: Create, list, detail, update

**Dashboard (4 tests)**
- `dashboard.cy.js`: Load, date filter, type+location filter, weekly chart

**Status Flow (3 tests)**
- `status-flow.cy.js`: Pending→Progress→Resolved, resolution date, invalid transition

**Assignments (2 tests)**
- `assignments.cy.js`: Assign role, duplicate prevention

**Comments (2 tests)**
- `comments.cy.js`: Add comment (UI), verify API list

**RBAC (4 tests)**
- `rbac.cy.js`: Citizen scope, operator scope, admin scope, permission denial

### Fixtures
- `fixtures/users.json`: Test user credentials (citizen, admin, operator)
- `fixtures/incidents.json`: Sample incident payload

### Custom Commands
- `support/commands.js`: Reusable login, API token, create/assign/status/comment helpers

## Environment

- `baseUrl`: http://localhost:3000
- `API_BASE`: http://localhost:8000/api
- Timeouts: 10s request, 8s command default

## CI/CD Integration

Add to `.github/workflows/ci.yml` (after frontend unit tests):
```yaml
- name: E2E Tests (Cypress)
  run: npm run test:e2e --workspace=frontend
```

## Test Coverage

| Area | Tests | Status |
|------|-------|--------|
| Authentication | 3 | ✅ |
| CRUD | 4 | ✅ |
| Filters + Charts | 4 | ✅ |
| State Machine | 3 | ✅ |
| Assignments | 2 | ✅ |
| Comments | 2 | ✅ |
| RBAC | 4 | ✅ |
| **Total** | **22** | **✅** |

## Debugging

```bash
# Run single spec
npx cypress run --spec="cypress/e2e/auth.cy.js"

# Run with logs
npx cypress run --headed

# Slow down execution
npx cypress run --slow-mo=100
```

## Notes

- Tests use real data from seeders (usuario@test.com, admin, operator)
- API calls bypass UI where possible for speed
- Tests are isolated and can run in any order
- Fixture data resets per test