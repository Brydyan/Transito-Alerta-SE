# Design: Unified Frontend Logging

## Technical Approach

Thin Angular injectable `LoggerService` wrapping `console.*` behind an `environment.production` gate, with Sentry breadcrumb forwarding for warn/error in production. All 22 migratable `console.*` calls across 12 files are replaced; the `menu.resolver.ts` debug tap is removed entirely. An ESLint `no-console: error` rule prevents regression after migration. No runtime overhead: Angular bakes `environment.production` at build time, and the production build tree-shakes the dev-only paths.

## Architecture Decisions

### D1: LoggerService Design

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Injectable service (`providedIn: 'root'`) | Follows existing project convention (all 15 core services use this pattern); testable via DI; singleton | **Chosen** |
| Global function (`window.logger`) | No DI, no testability, breaks Angular conventions | Rejected |
| Decorator (`@Log()`) | Requires class methods; does not work for inline error handlers | Rejected |

**Rationale**: Every existing core service uses `@Injectable({ providedIn: 'root' })`. The service exposes 4 methods: `debug`, `log`, `warn`, `error`. Each checks `environment.production` at call time (build-time constant, zero runtime cost).

### D2: Sentry Breadcrumb Forwarding

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `Sentry.captureMessage` for warn, `Sentry.captureException` for error | Aligns with Sentry severity model; uses existing SDK already initialized in `main.ts` | **Chosen** |
| `Sentry.addBreadcrumb()` only | Breadcrumbs alone are invisible unless an exception follows | Rejected |
| Custom Sentry transport | Over-engineered for 4-method service | Rejected |

**Rationale**: Guard with `Sentry.getCurrentClient()` before any Sentry call so the service is safe when `sentryDsn` is empty (dev builds). Production: `warn` calls `Sentry.captureMessage(msg, 'warning')`; `error` calls `Sentry.captureException` for Error instances, `Sentry.captureMessage(msg, 'error')` for strings.

### D3: ESLint no-console Rule

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `'no-console': 'error'` on `src/**/*.ts` (non-spec) block | CI rejects new raw console calls; activated post-migration | **Chosen** |
| `'no-console': 'warn'` | Allows regression in CI | Rejected |
| No rule (rely on code review) | Human error-prone | Rejected |

**Rationale**: The rule is added AFTER all 22 calls are migrated, so CI does not break during rollout. `main.ts` bootstrap `console.error` gets an `// eslint-disable-next-line no-console` exception (it fires before Angular DI is available).

### D4: Environment Gate

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `environment.production` boolean | Build-time constant, dead-code eliminated by `ng build --configuration production` | **Chosen** |
| Runtime `logLevel` enum | Overhead; no use case yet | Deferred (field added, unused) |
| `isDevMode()` Angular API | Runtime check, not tree-shakeable | Rejected |

**Rationale**: A forward-compatible `logLevel` field is added to both `environment.ts` and `environment.development.ts` but not consumed. When runtime log-level switching is needed, the service reads it without API changes.

### D5: menu.resolver.ts Debug Tap

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Remove `console.log` tap entirely (lines 19-25) | Resolver is stable; debug tap was temporary (F6 comment says so) | **Chosen** |
| Downgrade to `logger.debug()` | Adds noise to debug output for a stable resolver | Rejected |

**Rationale**: The `console.error` in the `catchError` block stays and migrates to `logger.error()`. Only the success-path `console.log` tap is removed.

## Data Flow

```
Component/Service error handler
        |
        v
  LoggerService.error(msg, ...args)
        |
        +---> [!production] console.error(msg, ...args)
        |
        +---> [production]  console.error(msg, ...args)
        |                   Sentry.captureException(msg) / captureMessage(msg, 'error')
        |                   (guarded by Sentry.getCurrentClient())

  LoggerService.debug/log(msg, ...args)
        |
        +---> [!production] console.debug/log(msg, ...args)
        +---> [production]  no-op (tree-shaken)
```

## Interfaces / Contracts

```typescript
@Injectable({ providedIn: 'root' })
export class LoggerService {
  debug(message: string, ...args: unknown[]): void;
  log(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string | Error, ...args: unknown[]): void;
}
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/app/core/services/logger.service.ts` | Create | LoggerService (~40 lines) |
| `frontend/src/app/core/services/logger.service.spec.ts` | Create | Unit tests (mock console + Sentry) |
| `frontend/src/environments/environment.ts` | Modify | Add `logLevel: 'warn'` field |
| `frontend/src/environments/environment.development.ts` | Modify | Add `logLevel: 'debug'` field |
| `frontend/src/app/core/guards/menu.resolver.ts` | Modify | Remove debug tap (lines 19-25); migrate `console.error` to `logger.error` |
| `frontend/src/app/features/auth/login/login.component.ts` | Modify | `console.error` -> `logger.error` |
| `frontend/src/app/features/error/error-page/error-page.component.ts` | Modify | `console.error` -> `logger.debug` (route dump is diagnostic) |
| `frontend/src/app/features/citizen/map/map.component.ts` | Modify | 2x `console.error` -> `logger.error` |
| `frontend/src/app/features/citizen/map/components/map-filters/map-filters.component.ts` | Modify | `console.error` -> `logger.error` |
| `frontend/src/app/features/citizen-report/citizen-report.component.ts` | Modify | `console.error` -> `logger.error` |
| `frontend/src/app/features/admin/roles/roles.component.ts` | Modify | 3x `console.error` -> `logger.error` |
| `frontend/src/app/features/admin/roles/role-editor/role-editor.component.ts` | Modify | 2x `console.error` -> `logger.error` |
| `frontend/src/app/features/admin/users/users-list/users-list.component.ts` | Modify | `console.error` -> `logger.error` |
| `frontend/src/app/features/admin/users/user-form/user-form.component.ts` | Modify | 4x `console.error` -> `logger.error` |
| `frontend/src/app/features/admin/audit-logs/audit-logs.component.ts` | Modify | 3x `console.error` -> `logger.error` |
| `frontend/src/app/shared/components/map-picker/map-picker.component.ts` | Modify | `console.warn` -> `logger.warn` |
| `frontend/src/main.ts` | Modify | Add `// eslint-disable-next-line no-console` above bootstrap catch |
| `frontend/eslint.config.js` | Modify | Add `'no-console': 'error'` to `src/**/*.ts` rules block |

**Totals**: 2 new, 16 modified, 0 deleted.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | LoggerService methods dispatch correctly per environment | Jest: mock `environment.production`, spy on `console.*` and `Sentry.*`; verify no-op in prod for debug/log; verify Sentry calls for warn/error in prod; verify no Sentry calls when `getCurrentClient()` returns null |
| Lint | No raw `console.*` in source | `npx eslint --no-warn` in CI (post-migration) |
| Manual | Production build produces no debug/log output | `ng build && serve dist/` with DevTools open |

## Threat Matrix

N/A -- no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No data migration required. Rollout is single-PR: create service, migrate all call sites, activate ESLint rule. The ESLint rule is the last commit in the PR so that intermediate commits do not break CI.

## Verification Checklist

- [ ] `LoggerService` is injectable and singleton (`providedIn: 'root'`)
- [ ] `debug`/`log` are no-ops in production builds
- [ ] `warn`/`error` forward to Sentry in production (guarded by `getCurrentClient()`)
- [ ] All 22 migratable `console.*` calls replaced
- [ ] `menu.resolver.ts` debug tap removed (not downgraded)
- [ ] `main.ts` bootstrap `console.error` kept with eslint-disable comment
- [ ] `no-console: error` ESLint rule active for `src/**/*.ts` (non-spec)
- [ ] No breaking changes to any public API, route, or component contract

## No Breaking Changes

This change is purely internal. No public API, route, template binding, or component contract changes. The `LoggerService` is new and consumed only by migrated call sites. The `logLevel` environment field is additive and unused. The ESLint rule is a development-time constraint only.
