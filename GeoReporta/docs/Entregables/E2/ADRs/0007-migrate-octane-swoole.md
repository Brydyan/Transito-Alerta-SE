# ADR-0007: Migrate Octane runtime from FrankenPHP to Swoole

- **Status:** Accepted
- **Date:** 2026-07-21
- **Supersedes:** ADR-0006 (FrankenPHP + Laravel Octane)
- **Deciders:** Equipo de Proyecto

## Context and Problem Statement

ADR-0006 chose FrankenPHP as the Octane runtime in July 2026 because it shipped native Mercure integration and required one Docker image for both the HTTP server and the SSE hub.

A month later, validation against `vendor/laravel/octane v2.17.5` revealed two latent runtime problems under FrankenPHP:

1. **`StreamedResponse` buffers** — `backend/app/Domains/Incidents/Reports/{Csv,Xlsx,Pdf}Exporter.php` and `backend/app/Storage/StorageProxyController.php` all return Symfony `StreamedResponse`. Under FrankenPHP, the Octane client (`vendor/laravel/octane/src/FrankenPhp/FrankenPhpClient.php`) is 51 LOC and just calls `$response->send()`; chunks accumulate in PHP's output buffer until the closure completes. Two GitHub PRs (#1141, #1144) attempting to add Generator-based streaming were **closed without merge** in June 2026 — the upstream maintainer position appears to be that this is architecturally impossible to fix under FrankenPHP's worker model. The `tests/Feature/Domains/Incidents/ExportIncidenciasTest.php:107,113` skips on the related paratest bug are a separate symptom, but the runtime buffering is real.
2. **`docker compose logs backend` produces ~30 noisy `ERROR unknown error.` lines** on boot — the parent `vendor/laravel/octane/src/Commands/StartFrankenPhpCommand.php:318` falls back to the literal `'unknown error.'` string when Caddy emits a JSON event without a `msg` field. PR #101 added a per-event capture (`App\Console\Commands\StartFrankenPhpCommand` subclass) that persists every line via `Log::channel('exceptions')` with the full payload, but the underlying noise remained.

The Mercure hub is **already** its own docker-compose service (`mercure` service in `docker-compose.yml`); no FrankenPHP-embedded Mercure integration is exercised in production. The original rationale for FrankenPHP — "one container instead of two" — is therefore obsolete.

## Considered Options

1. **Stay on FrankenPHP with the PR #101 capture and `: Generator` exporters** — keep current runtime, refactor the four exporters, accept buffered exports.
2. **Migrate to RoadRunner** — same Octane + Go-based model, but the stream bug isn't fixed without first refactoring exporters to `: Generator`. Upstream PR #939 (merged Aug 2024) added Generator-only streaming for RoadRunner.
3. **Migrate to Swoole** — change the Octane driver; `vendor/laravel/octane/src/Swoole/SwooleClient.php:233-249` streams plain closures via `ob_start(callback, 1) + $swooleResponse->write()` with no refactor. **Elegido.**
4. **Drop Octane entirely (FrankenPHP standalone or Swoole standalone)** — would lose `Octane::tick()`, `Octane::concurrently()`, the singleton-reset semantics, the request-context injection. Re-implementation cost in app code exceeds the gain.

## Decision Outcome

**Opción 3: Migrate to Swoole under Octane.**

**Razones:**

- **StreamedResponse streams natively** without a `: Generator` refactor in the four exporters. The whole PR-A from the original plan (refactor exporters) is unnecessary — net code reduction.
- **No equivalent of the `unknown error.` bug.** Inspection of `vendor/laravel/octane/src/Commands/StartSwooleCommand.php:171-192` shows clean handling for both JSON and non-JSON lines, with no cryptic fallback. The PR #101 subclass is therefore obsolete and gets deleted.
- **Future-proofing cost is zero today.** The project does not currently use `Octane::concurrently()`, `Octane::tick()`, `HttpClient`, or any other async primitive (verified by grep against `app/`). Migration enables those without rewriting existing code; nothing is "wasted" because the runtime already runs the same code.
- **Mercure stays.** Reimplementing Mercure on top of Swoole's native SSE costs ~2-3 weeks (JWT topic ACL, connection state map, history replay, frontend EventSource reuse) for ~5-30 ms latency improvement that the user cannot perceive. Mercure already covers all of that out of the box. Documented in PR #108.
- **Smaller Docker image, simpler Dockerfile.** Drop `dunglas/frankenphp:1.12.4-php8-alpine` base; use `php:8.3-cli-alpine`. We don't need the embedded Caddy binary anymore.

## Consequences

### Positive

- `StreamedResponse` from the four exporters + storage proxy streams progressively rather than buffering — semantically correct for CSV/XLSX/PDF downloads and S3 file proxying.
- Boot logs go from ~30 noisy `ERROR unknown error.` lines down to ~5 normal info lines (Caddy-cleanly-handled equivalents get logged at info level instead of pushed through the FrankenPHP fallback).
- The `App\Console\Commands\StartFrankenPhpCommand` subclass from PR #101 is deleted — net codebase **shrinks** by ~400 LOC despite adding the migration config.
- Issue #102 (the migration plan) closes with this PR (#108). Issues #103/#104/#107 also become moot under Swoole and should be closed after observing clean production logs for a week.

### Negative

- **PHP extension swap.** `ext-swoole` (^5.0) joins `require`; CI runners and developer Docker images must install it via `install-php-extensions swoole` or the equivalent. Local `composer install` outside Docker fails without swoole — this is the correct signal that swoole is a runtime requirement, not optional.
- **Health-check routing observation.** The `entrypoint.sh` `[HEALTH] PostgreSQL/Redis/S3 connected` echoes still flow through `stderr_json` because `LOG_CHANNEL=stderr_json`. Under FrankenPHP these caused false-positive `unknown error.` captures (since Laravel log records don't have a top-level `msg` field). Under Swoole, the same noise is captured at info level via `frankenphp_event` debug fields rather than error. Cleanup-of-noise is orthogonal and tracked in [Issue #107](https://github.com/Ali-Rr26/sistema-incidencias-georreferenciadas/issues/107) for completeness.
- **Debugging tooling expectations shift slightly.** Xdebug + Swoole requires explicit `--enable-coroutine` flag awareness; `pcov` covered by the same `install-php-extensions` list.

### Operational

- **Rebuild required.** The dev Docker image baked into `backend/Dockerfile` no longer matches the running container until `docker compose build backend && docker compose up -d backend` is run.
- **Backout.** Revert this commit; rebuild; services return to FrankenPHP. StreamedResponse buffering resumes. ~5 minutes including rebuild.
- **Local artisan.** Running `php artisan octane:start --server=swoole` outside Docker requires `ext-swoole` in the host's PHP. Local non-docker workflow is not a primary use case for this project.

## Implementation

Key files (full diff in PR #108):

| Change | File |
|---|---|
| Drop FrankenPHP base image | `backend/Dockerfile` (`FROM php:8.3-cli-alpine`) |
| Delete FrankenPHP worker bootstrap | `backend/public/frankenphp-worker.php` (deleted, 7 LOC) |
| Add `ext-swoole` requirement | `backend/composer.json` (`"ext-swoole": "^5.0"`) |
| Switch entrypoint command | `backend/entrypoint.sh` (`octane:frankenphp` → `octane:swoole --task-workers=2 --watch=false`) |
| Add `swoole` to install-php-extensions | `backend/Dockerfile` (`swoole` in `install-php-extensions` list) |
| Update server default + add swoole config block | `backend/config/octane.php` |
| Add swoole to CI extension list | `.github/workflows/ci.yml` |
| Delete PR #101's workaround | `backend/app/Console/Commands/StartFrankenPhpCommand.php` (264 LOC) + test (159 LOC) |
| Drop FrankenPHP worker from .gitignore | `.gitignore` |
| Update deployment guides | `README.md`, `DEPLOYMENT.md`, `deploy.yml`, `.github/workflows/deploy.yml`, `docs/Guias/docker-swarm-*.md` |
| Update frontend comment | `frontend/app/app-shell/app-shell.component.js` (line 1046) |
| Supersede ADR-0006 | `docs/Entregables/E2/ADRs/0006-frankenphp-octane.md` (status: superseded) — kept as historical record |
| New ADR | `docs/Entregables/E2/ADRs/0007-migrate-octane-swoole.md` (this file) |

## References

- [Issue #102](https://github.com/Ali-Rr26/sistema-incidencias-georreferenciadas/issues/102) — the migration decision log
- [PR #108](https://github.com/Ali-Rr26/sistema-incidencias-georreferenciadas/pull/108) — this migration
- [PR #101](https://github.com/Ali-Rr26/sistema-incidencias-georreferenciadas/pull/101) — the FrankenPHP workaround that this PR retires
- ADR-0006 (Frankenphp + Laravel Octane) — superseded
- External: `vendor/laravel/octane` v2.17.5 (latest, 2026-06-09); PRs #1141 and #1144 closed upstream without merge
- [Laravel Octane docs — Swoole server](https://laravel.com/docs/12.x/octane#dependency-installation)
