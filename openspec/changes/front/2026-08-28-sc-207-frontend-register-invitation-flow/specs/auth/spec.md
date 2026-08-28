# Spec: SC-207 — Frontend Register via Invitation Flow

## Domain: auth (Modified — Delta)

**Capability**: `auth-backend` (login, register/invitation-accept, token lifecycle)

## Endpoint / DTO Map

| Frontend Call | HTTP | Backend DTO / Response |
|---|---|---|
| `previewInvitation(token)` | `GET /invitations/preview?token=...` | `InvitationPreview { organization_name: string\|null, inviter_name: string\|null, role_name: string, expires_at: Date }` |
| `acceptInvitation(token, password, terms_version?)` | `POST /auth/accept-invitation` (201) | Req: `AcceptInvitationDto { token, password (min 12), terms_version? }`. Res: `AuthTokens { access_token, refresh_token, permissions: string[] }` |

## MODIFIED Requirements

### Requirement: Accept Invitation Flow (Registration via Invitation)

The system MUST replace self-service registration with invitation-only account creation. `POST /auth/register` MUST return 410 Gone (tombstoned). Users MUST create accounts exclusively via `POST /auth/accept-invitation`, reached by first previewing via `GET /invitations/preview?token=...`.

(Previously: R2 — Register Flow, self-service registration via `POST /auth/register` → 201, no auto-login, validated via 422/409 errors.)

#### Scenario: Preview invitation on load
- GIVEN a user has an invitation token in the URL (`?token=...`)
- WHEN `AcceptInvitationComponent` loads
- THEN `AuthService.previewInvitation(token)` calls `GET /invitations/preview?token=...`
- AND the backend returns `{ organization_name, inviter_name, role_name, expires_at }`

#### Scenario: Display invitation preview
- GIVEN preview data was received successfully
- WHEN the component renders
- THEN it MUST display "You're invited by {inviter_name} to join {organization_name} as {role_name}"
- AND MUST show the invitation's expiry date/time

#### Scenario: Set password with client-side validation
- GIVEN the preview is shown
- WHEN the user enters a password
- THEN the form MUST enforce `Validators.minLength(12)` client-side
- AND the backend remains the authoritative validator (client check is UX only, not a security boundary)

#### Scenario: Accept invitation succeeds (auto-login)
- GIVEN a valid, unexpired token and a password >= 12 chars
- WHEN the user submits the form
- THEN `AuthService.acceptInvitation(token, password, terms_version?)` MUST call `POST /auth/accept-invitation`
- AND the backend returns 201 with `{ access_token, refresh_token, permissions }`
- AND tokens MUST be persisted via `persistTokens`, `isAuthenticated()` becomes `true`
- AND the router MUST navigate to `/app/dashboard`

#### Scenario: Invalid token (404)
- GIVEN an unknown or malformed token
- WHEN the preview call fires
- THEN the 404 response MUST be caught
- AND the component MUST show "Invitation not found" via an `errorMessage` signal
- AND no tokens are stored

#### Scenario: Expired or already-used token (410)
- GIVEN a token that has expired or was already redeemed
- WHEN the accept call fires
- THEN the 410 response MUST be caught
- AND the component MUST show "Invitation expired or already used" via the `errorMessage` signal
- AND no tokens are stored

#### Scenario: Accept invitation validation failure (422)
- GIVEN a valid token but a password failing backend rules
- WHEN the accept call fires
- THEN the 422 response MUST be caught
- AND field-level errors MUST be mapped to the password control
- AND no tokens are stored

#### Scenario: Route available without guest guard
- GIVEN no active session, OR an already-authenticated session
- WHEN the user navigates to `/accept-invitation?token=abc123`
- THEN the route MUST load `AcceptInvitationComponent` without a `guestGuard`
- AND if a session already exists, it MUST be cleared before the new invitation is accepted (so the user can join a different org)

## REMOVED Requirements

### Requirement: R2.1 Successful Registration (self-service)
(Reason: `POST /auth/register` is tombstoned to 410 Gone; self-service signup is replaced by invitation-only onboarding)

### Requirement: R2.2 Registration Validation Failure (self-service)
(Reason: superseded by the "Accept invitation validation failure (422)" scenario above)

### Requirement: R2.3 Email Already Exists
(Reason: self-service registration removed; email-exists is enforced at invitation-creation time, not at this flow)

## Coverage
Happy paths: covered (preview success, accept success, auto-login). Edge cases: covered (missing token, already-used). Error states: covered (404, 410, 422, validation).

## Next
Ready for sdd-tasks.
