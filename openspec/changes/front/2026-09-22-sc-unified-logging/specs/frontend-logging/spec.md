# Frontend Logging Specification

## Purpose

Defines the behavior of the centralized `LoggerService` that replaces all
raw `console.*` calls in the frontend. The service gates output by
environment, forwards warn/error to Sentry breadcrumbs, and is backed by
an ESLint rule that prevents new raw calls from reaching the codebase.

---

## Requirements

### Requirement: Production Environment Silences Debug and Log

In production builds the service MUST suppress all debug and log output.
No call to `LoggerService.debug()` or `LoggerService.log()` SHALL produce
any console output when `environment.production` is `true`.

#### Scenario: debug call is silent in production

- GIVEN the Angular app is compiled with `environment.production = true`
- WHEN `LoggerService.debug('some message')` is called at runtime
- THEN no output appears in `console.debug` or any other console channel

#### Scenario: log call is silent in production

- GIVEN the Angular app is compiled with `environment.production = true`
- WHEN `LoggerService.log('some message')` is called at runtime
- THEN no output appears in `console.log` or any other console channel

---

### Requirement: Production Environment Forwards Errors to Sentry

In production builds the service MUST emit to `console.error` AND create a
Sentry event when `LoggerService.error()` is called.

#### Scenario: error call emits console output and Sentry event in production

- GIVEN the Angular app is compiled with `environment.production = true`
- AND Sentry is initialized with a valid DSN
- WHEN `LoggerService.error('failure', errorObject)` is called
- THEN `console.error` receives the message and payload
- AND a Sentry event is captured (e.g. via `Sentry.captureException` or equivalent)

---

### Requirement: Production Environment Forwards Warnings to Sentry

In production builds the service MUST emit to `console.warn` AND add a
Sentry breadcrumb when `LoggerService.warn()` is called.

#### Scenario: warn call emits console output and Sentry breadcrumb in production

- GIVEN the Angular app is compiled with `environment.production = true`
- AND Sentry is initialized with a valid DSN
- WHEN `LoggerService.warn('degraded state')` is called
- THEN `console.warn` receives the message
- AND `Sentry.addBreadcrumb` is called with category `warn` and the message

---

### Requirement: Development Environment Passes All Methods Through

In development builds the service MUST pass all four methods (`debug`, `log`,
`warn`, `error`) to their respective console channels without Sentry
involvement.

#### Scenario: all four methods produce console output in development

- GIVEN the Angular app runs with `environment.production = false`
- WHEN `LoggerService.debug`, `.log`, `.warn`, and `.error` are each called once
- THEN each call produces output in its matching console channel
- AND no Sentry API (`addBreadcrumb`, `captureException`) is invoked

---

### Requirement: Graceful No-Op When Sentry Is Not Initialized

The service MUST NOT throw when Sentry is unavailable or not initialized.
All calls MUST complete silently if Sentry integration is absent.

#### Scenario: error call with Sentry uninitialized does not throw

- GIVEN the Angular app is compiled with `environment.production = true`
- AND Sentry has not been initialized (no DSN configured)
- WHEN `LoggerService.error('failure')` is called
- THEN `console.error` still receives the message
- AND no exception is thrown by the service

#### Scenario: warn call with empty sentryDsn does not throw

- GIVEN `environment.sentryDsn` is an empty string `""`
- AND the Angular app is compiled with `environment.production = true`
- WHEN `LoggerService.warn('warning')` is called
- THEN `console.warn` still receives the message
- AND no exception is thrown by the service

---

### Requirement: All Raw Console Call Sites Replaced

After migration every `console.*` call site (except `main.ts` bootstrap)
MUST be replaced with the equivalent `LoggerService` method. Zero raw
`console.*` calls SHALL remain in application source files.

#### Scenario: 23 console call sites replaced across 13 files

- GIVEN the migration task list covers 23 raw `console.*` calls in 13 files
- WHEN the migration is complete
- THEN a full-repository grep for `console\.` in `frontend/src/app/**` returns zero matches
- AND `main.ts` is the sole permitted exception

---

### Requirement: ESLint no-console Rule Enforced

After migration the `no-console` ESLint rule MUST be set to `error` in
`eslint.config.*`. Any new raw `console.*` call in frontend application
source MUST fail the lint step in CI.

#### Scenario: raw console call introduced post-migration fails lint

- GIVEN the ESLint `no-console` rule is active at `error` level
- WHEN a developer adds `console.log('debug')` to any file under `frontend/src/app/`
- THEN `eslint` exits with a non-zero code
- AND CI reports a lint failure for that file

#### Scenario: LoggerService calls do not trigger the ESLint rule

- GIVEN the ESLint `no-console` rule is active at `error` level
- WHEN the codebase contains only `LoggerService.*` calls (no raw console)
- THEN `eslint` exits with code zero for all application source files

---

## Acceptance Criteria

| # | Criterion | Verifiable By |
|---|-----------|---------------|
| 1 | `LoggerService.debug/log` produce no output in production | Unit test: spy on `console.debug/log`, assert not called |
| 2 | `LoggerService.error` calls `Sentry.captureException` in production | Unit test: spy on Sentry, assert called |
| 3 | `LoggerService.warn` calls `Sentry.addBreadcrumb` in production | Unit test: spy on Sentry, assert called |
| 4 | All 4 methods forward to console in development | Unit test: spy on all console channels, assert called |
| 5 | Sentry NOT called in development | Unit test: spy on Sentry, assert never called |
| 6 | No exception when Sentry absent | Unit test: mock Sentry as undefined, assert no throw |
| 7 | Zero raw `console.*` in `frontend/src/app/` | ESLint + grep check in CI |
| 8 | `no-console` ESLint rule active at `error` level | Lint run exits non-zero on any new raw console call |
