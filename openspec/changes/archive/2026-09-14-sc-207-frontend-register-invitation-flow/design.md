# Design: SC-207 — Frontend Register via Invitation Flow

## Technical Approach
Add one standalone, `OnPush` component (`AcceptInvitationComponent`) mirroring `LoginComponent` conventions exactly (FormBuilder + ReactiveForms, `errorMessage`/`loading` signals, inline error rendering — no toast). Extend `AuthService` (no new service) with `previewInvitation()` and `acceptInvitation()`, reusing existing `persistTokens`/`handleError`. Route `/accept-invitation` added without `guestGuard` so already-authenticated users can still join a new org.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Component structure | Standalone, OnPush, signals (`invitation`, `loading`, `error`) | Zone-based; NgRx | Matches LoginComponent; no state lib in features/auth |
| Service placement | Extend AuthService (`previewInvitation`, `acceptInvitation`) | New InvitationService | AuthService owns persistTokens/handleError; avoids duplication |
| Preview base URL | `${environment.apiUrl}/invitations/preview` (new base, sibling to API_URL=.../auth) | Reuse API_URL with override | Backend controller is /invitations, not /auth |
| Token source | `ActivatedRoute.snapshot.queryParamMap.get('token')` in ngOnInit | Reactive queryParams subscription | One-shot deep-link param; avoids unneeded subscription |
| Error UI | `errorMessage` signal inline text (like LoginComponent) | Toast/snackbar | No toast service exists; NotificationService is domain notifications, not UI toast |
| Route guard | No guestGuard; clear existing session in ngOnInit before preview | Apply guestGuard | guestGuard redirects authed users away, breaking invitation links |

## Data Flow
URL ?token=... → ngOnInit → AuthService.previewInvitation(token) → 200: invitation.set(preview) | 404/410: error.set(message) → password form (minLength 12) → onSubmit → AuthService.acceptInvitation(token, password) → 201: persistTokens() + router.navigate(['/app/dashboard']) | 422: error.set + field errors | 404/410: error.set, no tokens stored.

## File Changes
| File | Action | Description |
|---|---|---|
| `frontend/src/app/core/services/auth.service.ts` | Modify | Add previewInvitation, acceptInvitation; remove throwing register() stub |
| `frontend/src/app/core/models/auth.model.ts` | Modify | Add InvitationPreview, AcceptInvitationDto; delete deprecated RegisterRequest/RegisterResponse |
| `frontend/src/app/features/auth/accept-invitation/accept-invitation.component.ts` | Create | Standalone component, signals, ReactiveForms |
| `frontend/src/app/features/auth/accept-invitation/accept-invitation.component.html` | Create | Preview block, password form, error/loading states |
| `frontend/src/app/features/auth/accept-invitation/accept-invitation.component.spec.ts` | Create | Jest unit tests (preview, accept, 404/410/422) |
| `frontend/src/app/app.routes.ts` | Modify | Add { path: 'accept-invitation', loadComponent: ... } (no canActivate) |

## Interfaces / Contracts
```ts
export interface InvitationPreview {
  organization_name: string | null;
  inviter_name: string | null;
  role_name: string;
  expires_at: string;
}
export interface AcceptInvitationDto {
  token: string;
  password: string; // Validators.minLength(12), backend-authoritative
  terms_version?: string;
}
// Response reuses AuthTokens { access_token, refresh_token, permissions }

previewInvitation(token: string): Observable<InvitationPreview>
acceptInvitation(dto: AcceptInvitationDto): Observable<AuthTokens>
```

## Testing Strategy
| Layer | What to Test | Approach |
|---|---|---|
| Unit | AuthService preview/accept success + 404/410/422 mapping | Jest + HttpClientTestingModule, mirror auth.service.spec.ts |
| Unit | AcceptInvitationComponent: preview render, form validation, submit→navigate, error states | Jest + TestBed, fake AuthService/ActivatedRoute |
| Integration | Route resolves without guestGuard; session clears when pre-authenticated | Jest route harness |
| E2E | Deferred (Stream 1, out of scope) | N/A |
Target: >=70% coverage on new/modified code.

## Migration / Rollout
No migration required. Isolated additive change. Rollback: delete features/auth/accept-invitation/, drop route entry, restore throwing register() stub.

## Open Questions
None — all 3 approval-needed decisions from the proposal (inline errors, no guestGuard, canonical /auth/accept-invitation endpoint) resolved above.

## Next
Ready for sdd-tasks.
