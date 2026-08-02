# Tasks: Custom JWT Auth Sessions

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~900-1000 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: Foundation → PR 2: Domain → PR 3: Wiring |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

## Phase 1: Composer & Config Cleanup

- [x] 1.1 Update `composer.json` — remove `laravel/sanctum`, add `lcobucci/jwt` ^5
- [x] 1.2 Delete `config/sanctum.php`
- [x] 1.3 Delete `database/migrations/2026_06_16_021559_drop_sessions_table.php`
- [x] 1.4 Delete `database/migrations/2026_06_16_021558_create_personal_access_tokens_table.php`
- [x] 1.5 Create `database/migrations/2026_06_22_000001_create_sessions_table.php`
- [x] 1.6 Create `database/migrations/2026_06_22_000002_remove_personal_access_tokens.php`

## Phase 2: Session Domain & JWT Service

- [x] 2.1 Create `app/Sessions/Domain/Entities/Session.php` — value object
- [x] 2.2 Create `app/Sessions/Domain/Repositories/SessionRepository.php` — interface
- [x] 2.3 Create `app/Sessions/Infrastructure/Models/Session.php` — Eloquent model
- [x] 2.4 Create `app/Sessions/Infrastructure/Repositories/EloquentSessionRepository.php` — repo impl
- [x] 2.5 Create `app/Auth/Infrastructure/Services/JwtService.php` — JWT service using lcobucci/jwt

## Phase 3: Middleware, Controller & Wiring

- [ ] 3.1 Create `app/Sessions/Interfaces/Middleware/JwtAuthenticate.php`
- [ ] 3.2 Rewrite `AuthController::login`
- [ ] 3.3 Rewrite `AuthController::refresh`
- [ ] 3.4 Rewrite `AuthController::logout`
- [ ] 3.5 Rewrite `AuthController::me`
- [ ] 3.6 Update `User.php` — remove `HasApiTokens`, add `sessions()` HasMany
- [ ] 3.7 Update `routes/api.php` — replace `auth:sanctum` with `auth:jwt`
- [ ] 3.8 Register `auth:jwt` alias in `bootstrap/app.php`
- [ ] 3.9 Update `config/scramble.php`

## Phase 4: Tests

- [ ] 4.1 Unit test `JwtService`
- [ ] 4.2 Unit test `Session` entity
- [ ] 4.3 Integration: POST `/api/auth/login`
- [ ] 4.4 Integration: POST `/api/auth/refresh`
- [ ] 4.5 Integration: POST `/api/auth/logout`
- [ ] 4.6 Integration: middleware scenarios
- [ ] 4.7 E2E: full session lifecycle
