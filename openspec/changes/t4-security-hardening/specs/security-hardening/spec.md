# Security Hardening Specification

**Change**: t4-security-hardening  
**Author**: Claude (Architect role)  
**Date**: 2026-08-21  

---

## Purpose

Enforce standard HTTP security headers across all API endpoints, verify input validation security against SQL injection and XSS exploits, and resolve a critical notification deduplication bug that causes duplicate events due to an incorrect TypeORM range query in the `NotificationsService`.

---

## Scope Summary

### In scope
- **T4.3a — Helmet Headers Setup**: Add `helmet` dependency to `backend/package.json` and register `helmet()` as the first middleware in `backend/src/main.ts`'s bootstrap cycle.
- **T4.3b — Security Input Regressions**: Add E2E tests in `backend/test/e2e/regressions.e2e-spec.ts` that attempt classic SQL injection (e.g. `' DROP TABLE incidents; --`) and XSS (e.g. `<script>alert('xss')</script>`) payloads to guarantee parameterized queries protect the persistence layer and inputs are handled securely.
- **T4.3c — Notification Deduplication Bugfix**: Fix the range comparison bug in `backend/src/modules/notifications/notifications.service.ts` where `created_at` uses a plain `Date` equality match instead of the proper TypeORM `MoreThan()` range finder, and write an E2E test to verify deduplication behavior.

### Out of scope
- Rate limiting / throttle modifications (already configured).
- CORS setup changes (already configured).
- Performance load testing with k6 (deferred to T4.2).
- Swagger / OpenAPI documentation (deferred to T4.4).

---

## Requirements

### HTTP Security Headers (Helmet)

The NestJS web application MUST inject standard security headers on every HTTP response.
- `X-Frame-Options` MUST be set to `SAMEORIGIN` to mitigate clickjacking attacks.
- `X-Content-Type-Options` MUST be set to `nosniff` to prevent MIME-type sniffing.
- The middleware MUST be registered immediately after creating the Nest application instance and before global pipes, prefixes, or adapters are applied, ensuring that even early-lifecycle errors or route prefixes receive the security headers.

### Notification Deduplication

The notification module MUST throttle duplicate notifications sent to the same user for the same event type (and incident id if applicable) within a rolling 60-second window.
- The `NotificationsService` MUST perform a range check on `created_at` that evaluates `created_at > :sixtySecondsAgo`.
- The range check MUST use the native TypeORM `MoreThan` utility rather than a plain JS Date value to ensure proper SQL comparison generation (`>` instead of `=`).
- If an existing notification is found within the last 60 seconds, the new notification MUST NOT be persisted, and `notify()` MUST return `null`.

### Input Security & SQL Injection Protection

The system MUST protect the persistence layer against SQL injection attacks across all endpoints that receive user-provided string fields.
- User input MUST never be directly interpolated into raw SQL queries.
- SQL injection payloads (e.g., `' DROP TABLE incidents; --`) sent to endpoints like `POST /api/incidents` MUST either be rejected as bad requests (`400`) due to maximum length constraints or saved strictly as safe literal strings (`210`/`201`).
- The database MUST remain completely intact, and subsequent queries MUST run without failure.

### Cross-Site Scripting (XSS) Mitigation

All user-supplied string data returned by the API MUST be treated as untrusted data.
- PAYLOADS containing HTML/JS tags (such as `<script>alert("xss")</script>`) MUST either be rejected as `400` or, if stored, must be returned exactly as raw JSON strings. Since the API is pure JSON (and not HTML/SSR), it does not execute scripts directly, but verifying literal string preservation ensures that no database triggers or downstream processors interpret the text.

---

## Scenarios

#### Scenario: Deduplicate identical notifications within 60 seconds
- GIVEN an active `NotificationsService` and a provisioned operator
- WHEN `notify()` is called twice sequentially with identical user, type, and incident ID within less than 60 seconds
- THEN the first call successfully creates and returns a `Notification` entity
- AND the second call returns `null` (deduplicated)

#### Scenario: Prevent SQL Injection on incident creation
- GIVEN an authenticated operator
- WHEN they request `POST /api/incidents` with a title containing `' DROP TABLE incidents; --`
- THEN the request completes with either `201` (saved as literal string data due to parameterized queries) or `400` (due to input validation constraints), but NEVER `500`
- AND the `incidents` table remains intact, and a subsequent `GET /api/incidents` query succeeds

#### Scenario: Handle XSS scripts safely in API payloads
- GIVEN an authenticated operator
- WHEN they request `POST /api/incidents` with a title containing `<script>alert("xss")</script>`
- THEN the request completes with either `201` (saved as literal string) or `400` (validation failure)
- AND if saved with `201`, querying `GET /api/incidents` returns the title verbatim as string literal `"<script>alert(\"xss\")</script>"`

#### Scenario: Inject security headers on every response
- GIVEN a client making any HTTP request to the API (e.g. `GET /api/incidents`)
- WHEN the request is completed by the NestJS application
- THEN the response headers MUST contain:
  - `x-frame-options: SAMEORIGIN`
  - `x-content-type-options: nosniff`

---

## Acceptance Criteria

- [ ] `NotificationsService.notify()` successfully throttles duplicates within 60 seconds, returning `null` on the second call.
- [ ] SQL injection attempt on incident title does not crash the server (no 500) and does not execute SQL (table is not dropped).
- [ ] XSS payload in title does not crash the server and returns the string literal verbatim or rejects with 400.
- [ ] Every HTTP response includes `X-Frame-Options: SAMEORIGIN` and `X-Content-Type-Options: nosniff` headers.
- [ ] Dependency `helmet` is added to `backend/package.json` under dependencies.
- [ ] `pnpm run lint`, `pnpm run typecheck`, and `pnpm run build` compile without any error or warning.
- [ ] `pnpm test` and `pnpm run test:e2e` pass completely, with all new regression tests green.
