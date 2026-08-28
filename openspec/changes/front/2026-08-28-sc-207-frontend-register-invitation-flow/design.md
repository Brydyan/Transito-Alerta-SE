# Design: SC-207 — Frontend Register via Invitation Flow

Source: proposal #583, spec #590 (7 requirements: preview, display, password
form, accept/auto-login, 404, 410, route access without guestGuard).

## Technical Approach

Add one standalone, `OnPush` component (`AcceptInvitationComponent`) that
mirrors `LoginComponent`'s conventions exactly (FormBuilder + ReactiveForms,
`errorMessage`/`loading` signals, inline error rendering — no toast
dependency). Extend `AuthService` — do not add a new service — with
`previewInvitation()` and `acceptInvitation()`, reusing its existing
`persistTokens`/`handleError` plumbing so token persistence and auto-login
stay in one place. Route `/accept-invitation` is added without `guestGuard`
so already-authenticated users (invited to a second org) can still land on
the flow.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Component structure | Standalone, `ChangeDetectionStrategy.OnPush`, signals for `invitation`/`loading`/`error` | Zone-based (no OnPush); NgRx store | Matches `LoginComponent` exactly; no state-management lib exists in `features/auth` |
| Service placement | Extend `AuthService` (`previewInvitation`, `acceptInvitation`) | New `InvitationService` | `AuthService` already owns `persistTokens`/`handleError`; a second service would duplicate token logic |
| Preview base URL | `${environment.apiUrl}/invitations/preview` (new base, sibling to `API_URL = .../auth`) | Reuse `API_URL` with path override | Backend controller is `/invitations`, not `/auth`; don't fake a shared prefix |
| Token source | `ActivatedRoute.snapshot.queryParamMap.get('token')` read once in `ngOnInit` | Reactive `queryParams` subscription | Token is a one-shot deep-link param, not expected to change post-load; snapshot avoids an unneeded subscription/unsubscribe pair |
| Error UI | `errorMessage`-signal inline text (like `LoginComponent`) | Toast/snackbar | No toast service exists (`NotificationService` is domain notifications, not UI toasts); avoids adding a UI dependency for one flow |
| Route guard | No `guestGuard`; clear any existing session in `ngOnInit` before preview | Apply `guestGuard` (redirects authed users away) | `guestGuard` would break invitation links for already-logged-in users; spec requires session-clear-then-accept |

## Data Flow

    URL ?token=... ──▶ ngOnInit ──▶ AuthService.previewInvitation(token)
                                          │
                              ┌───────────┴────────────┐
                          200 OK                    404 / 410
                              │                          │
                    invitation.set(preview)     error.set(message)
                              │
                    [password form, minLength(12)]
                              │
                       onSubmit() ──▶ AuthService.acceptInvitation(token, password)
                                          │
                        ┌─────────────────┼─────────────────┐
                    201 Created        422 (fields)      404/410
                        │                  │                  │
              persistTokens()      error.set +          error.set
              (existing logic)     field errors          (no tokens)
                        │
              router.navigate(['/app/dashboard'])

## File Changes

| File | Action | Description |
|---|---|---|
| `frontend/src/app/core/services/auth.service.ts` | Modify | Add `previewInvitation(token)`, `acceptInvitation(token, password, terms_version?)`; remove throwing `register()` stub |
| `frontend/src/app/core/models/auth.model.ts` | Modify | Add `InvitationPreview`, `AcceptInvitationDto`; delete deprecated `RegisterRequest`/`RegisterResponse` |
| `frontend/src/app/features/auth/accept-invitation/accept-invitation.component.ts` | Create | Standalone component, signals, ReactiveForms |
| `frontend/src/app/features/auth/accept-invitation/accept-invitation.component.html` | Create | Preview block, password form, error/loading states |
| `frontend/src/app/features/auth/accept-invitation/accept-invitation.component.spec.ts` | Create | Jest unit tests (preview, accept, 404/410/422 paths) |
| `frontend/src/app/app.routes.ts` | Modify | Add `{ path: 'accept-invitation', loadComponent: ... }` (no `canActivate`) |

## Interfaces / Contracts

```ts
// auth.model.ts additions
export interface InvitationPreview {
  organization_name: string | null;
  inviter_name: string | null;
  role_name: string;
  expires_at: string; // ISO date
}

export interface AcceptInvitationDto {
  token: string;
  password: string; // Validators.minLength(12), backend-authoritative
  terms_version?: string;
}
// Response reuses existing AuthTokens { access_token, refresh_token, permissions }
```

```ts
// auth.service.ts additions
previewInvitation(token: string): Observable<InvitationPreview>
acceptInvitation(dto: AcceptInvitationDto): Observable<AuthTokens>
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | `AuthService.previewInvitation`/`acceptInvitation` success + 404/410/422 error mapping | Jest + `HttpClientTestingModule`, mirror `auth.service.spec.ts` patterns |
| Unit | `AcceptInvitationComponent`: preview render, form validation (minLength 12), submit → navigate, error signal states | Jest + `TestBed`, fake `AuthService`/`ActivatedRoute` |
| Integration | Route resolves component without `guestGuard`; session clears before preview when pre-authenticated | Jest route harness or component-level guard bypass check |
| E2E | Deferred (Stream 1, out of scope per proposal) | N/A |

Target: >=70% coverage on new/modified code, per proposal success criteria.

## Migration / Rollout

No migration required. Isolated additive change: new component + route,
extended service. Rollback = delete `features/auth/accept-invitation/`, drop
the route entry, restore throwing `register()` stub. No backend/DB changes.

## Open Questions

None — all three approval-needed decisions from the proposal (inline errors,
no guestGuard, canonical `/auth/accept-invitation` endpoint) are resolved
above and carried into this design.
