# Testing and CI Commands

This document collects the commands to run the frontend, backend, and CI checks locally.

## Quick path

### Frontend

```bash
cd frontend
npm install
npm run lint
npm run format
npm run test
npm run test:unit
npm run test:integration
npm run test:snapshot
```

### Backend

```bash
cd backend
composer install
composer run lint
composer run format
composer run format:check
composer run test:unit
composer run test:feature
composer run test
```

### Full local check

```bash
cd frontend && npm run lint && npm run format && npm run test
cd ../backend && composer run lint && composer run format:check && composer run test
```

## Details

| Area | Command | Purpose |
|------|---------|---------|
| Frontend dependencies | `npm install` | Installs Vitest, ESLint, Prettier, and browser test dependencies. |
| Frontend lint | `npm run lint` | Runs ESLint over `app/**/*.js`. |
| Frontend format check | `npm run format` | Verifies Prettier formatting for JS, CSS, HTML, and config files. |
| Frontend tests | `npm run test` | Runs all Vitest tests. |
| Frontend unit tests | `npm run test:unit` | Runs unit tests only. |
| Frontend integration tests | `npm run test:integration` | Runs integration tests only. |
| Frontend snapshot tests | `npm run test:snapshot` | Runs snapshot tests only. |
| Backend dependencies | `composer install` | Installs Laravel/Pest/Pint dependencies. |
| Backend lint | `composer run lint` | Runs Pint in test mode. |
| Backend format | `composer run format` | Applies Pint formatting. |
| Backend format check | `composer run format:check` | Verifies Pint formatting without changing files. |
| Backend unit tests | `composer run test:unit` | Runs PHPUnit/Pest unit tests. |
| Backend feature tests | `composer run test:feature` | Runs feature tests only. |
| Backend tests | `composer run test` | Runs the full backend test suite. |

## CI

The GitHub Actions workflow mirrors the local checks:

- Frontend quality: `npm run lint`, `npm run format`
- Frontend suites: `npm run test:unit`, `npm run test:integration`, `npm run test:snapshot`
- Backend: `composer run lint`, `composer run format:check`, `composer run test`
- CI backend job runs on PHP 8.4 because the locked dependency set requires it.

## Notes

- Run the commands from the `frontend/` and `backend/` folders as shown.
- The frontend CI uses `npm ci` for reproducible installs.
- If `npm ci` fails in CI, regenerate `frontend/package-lock.json` from `frontend/package.json` and rerun the workflow.
