# Delta for admin-user-creation-form — S3: Account Status Toggle in Edit Form

## ADDED Requirements

### Requirement: Account Status Toggle in User Edit Form (Master-Only)

The user edit form MUST render a "Cuenta" section containing an
active/inactive toggle when the authenticated user has the `master` role.
The section MUST NOT be visible to non-master roles. Toggling to inactive
MUST trigger a confirmation dialog before the PATCH is sent.

#### Scenario: Master opens edit form and sees Cuenta section

- GIVEN a master-role user is authenticated
- WHEN the master opens the edit form for any staff user
- THEN a "Cuenta" section is visible in the form
- AND the section contains a toggle that reflects the target user's current `is_active` value

#### Scenario: Master toggles user to inactive — confirmation dialog appears

- GIVEN the master has the edit form open for an active user (`is_active = true`)
- WHEN the master switches the toggle to inactive
- THEN a confirmation dialog appears
- AND the dialog text warns that active sessions will be invalidated
- AND no PATCH request is sent yet

#### Scenario: Master confirms deactivation

- GIVEN the confirmation dialog is open
- WHEN the master clicks the confirm action
- THEN `PATCH /api/users/:id` is sent with body `{ "is_active": false }`
- AND the form reflects the user as inactive after a successful 200 response

#### Scenario: Master cancels deactivation

- GIVEN the confirmation dialog is open
- WHEN the master clicks the cancel action
- THEN the dialog closes
- AND no PATCH request is sent
- AND the toggle reverts to its previous state (active)

#### Scenario: Non-master opens edit form — Cuenta section not visible

- GIVEN a user with a role other than `master` (e.g. `admin_org`) is authenticated
- WHEN that user opens the edit form for another user
- THEN the "Cuenta" section is NOT rendered in the form
- AND no is_active toggle is visible
