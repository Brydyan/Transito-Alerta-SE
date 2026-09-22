# Proposal: Unified Frontend Logging

## Intent

23 raw `console.*` calls across 13 frontend files fire unconditionally in production, leaking internal paths and creating noise in DevTools. There is no environment gate, no Sentry breadcrumb forwarding, and no ESLint enforcement to prevent new raw calls. A thin `LoggerService` centralizes logging, silences debug/log in production at zero runtime cost (`environment.production` is baked at build time), and forwards warn/error to Sentry breadcrumbs for production trace visibility.

## Scope

### In Scope
- Create `LoggerService` in `frontend/src/app/core/services/` (~40 lines, 4 methods: debug, log, warn, error)
- Add `logLevel` field to `environment.ts` and `environment.development.ts` (forward-compatible, unused initially)
- Migrate 23 `console.*` call sites across 13 files to `LoggerService`
- Remove debug tap in `menu.resolver.ts` entirely (not downgraded)
- Add `no-console: error` ESLint rule (activated post-migration)

### Out of Scope
- Backend logging (mature `LOG_LEVEL + RequestIdLogger`, no changes needed)
- Sentry initialization changes (already in place)
- Runtime log-level switching (future — `logLevel` field prepared but unused)
- Structured logging / log aggregation pipeline

## Capabilities

### New Capabilities
- `frontend-logging`: Environment-aware logging service with Sentry breadcrumb forwarding

### Modified Capabilities
- None

## Approach

**D1**: Thin injectable `LoggerService` over alternatives (global function, decorator) — DI enables testing and Angular conventions.
**D2**: Sentry breadcrumb forwarding via `Sentry.addBreadcrumb()` in warn/error methods — no SDK config changes needed.
**D3**: ESLint `no-console: error` activated only after all 23 sites are migrated — avoids CI breakage during rollout.
**D4**: `environment.production` boolean as build-time gate — zero runtime overhead, already available.
**D5**: `menu.resolver.ts` debug tap removed entirely — it was development-only diagnostic noise.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/src/app/core/services/logger.service.ts` | New | LoggerService implementation |
| `frontend/src/environments/environment*.ts` | Modified | Add `logLevel` field |
| 13 component/service files | Modified | Replace `console.*` with `LoggerService` |
| `frontend/eslint.config.*` | Modified | Add `no-console` rule |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Sentry init-order race | Low | `Sentry.init()` runs before Angular bootstrap — safe |
| Missed console call sites | Low | ESLint rule catches any remnants post-migration |
| Router config leak in error-page | Low | `LoggerService.debug` becomes no-op in prod |

## Rollback Plan

Revert the `LoggerService` file and 13 migration edits. Remove `no-console` ESLint rule. No database, API, or configuration changes to undo.

## Dependencies

- Sentry SDK already initialized in the frontend bundle

## Success Criteria

- [ ] All 23 `console.*` calls replaced with `LoggerService` methods
- [ ] No raw `console.log` in frontend source (except `main.ts` bootstrap)
- [ ] ESLint `no-console` rule enforced
- [ ] Production bundle shows no debug/log output in DevTools
- [ ] warn/error calls produce Sentry breadcrumbs
- [ ] No new raw console calls possible (ESLint blocks them)
