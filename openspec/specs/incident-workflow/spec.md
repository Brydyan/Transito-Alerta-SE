# Specification: incident-workflow

## Purpose

Define the behavioral contract for operator claim/release lifecycle, available-operator query, and
status catalog endpoint. Scenarios are derived from `IncidentClaimService.php` business rules.

## Scope Summary

**In scope**: `POST /api/incidents/:id/claim`, `POST /api/incidents/:id/release`,
`GET /api/incidents/:id/available-operators`, `GET /api/incidents/statuses`.

**Not additive**: adds `claimed_by` column to `incidents` and `max_active_claims` to `organizations`.
All existing incident endpoints MUST behave identically before and after T5.1.

## Requirements

### State Machine (Added by sc-315: Fix máquina de estados)

#### R0.1 — Los cuatro estados son alcanzables

The workflow service MUST recognize all four states that the database and `IncidentStatus` enum support: `pending`, `in_progress`, `resolved`, and `closed`.

- Scenario: `getStatuses()` returns all four states. GIVEN a call to retrieve available statuses, THEN the list includes `['pending', 'in_progress', 'resolved', 'closed']`.
- Scenario: Internal type completeness. GIVEN the internal type of `status` in the workflow service, THEN it includes `'closed'`, equivalent to `incident.entity.ts`.
- Scenario: Transition to `closed` is possible. GIVEN an incident in `in_progress` with a user holding `CLOSE incidents` permission, WHEN closed due to impossibility, THEN the transition persists instead of being rejected as an unknown state.

#### R0.2 — Máquina de estados declarada

Valid state transitions MUST be declared in a single location, and all undeclared transitions MUST be rejected with 409.

- Scenario: Assign operator. GIVEN an incident in `pending`, WHEN an operator is assigned, THEN the status transitions to `in_progress`.
- Scenario: Resolve. GIVEN an incident in `in_progress`, WHEN the operator resolves it, THEN the status transitions to `resolved`.
- Scenario: Close without resolution. GIVEN an incident in `in_progress` that cannot be resolved, WHEN closed, THEN it transitions to `closed`.
- Scenario: Mutually exclusive terminals. GIVEN an incident in `resolved`, WHEN attempting to transition to `closed`, THEN the request fails with 409: they are alternative outcomes, not sequential.
- Scenario: No transitions from terminal states. GIVEN an incident in `resolved` or `closed`, WHEN attempting any transition, THEN the request fails with 409.
- Scenario: No state skipping. GIVEN an incident in `pending`, WHEN attempting a direct transition to `resolved`, THEN the request fails with 409: an incident requires an assigned operator before resolution.
- Scenario: Discard invalid report. GIVEN a `pending` incident that is duplicate or invalid, WHEN an `admin_org` user closes it with a reason, THEN it transitions to `closed` without passing through `in_progress`.
- Scenario: Critical incidents don't skip states. GIVEN an incident created with `priority = 'critical'`, THEN it is born in `pending` like any other: urgency is expressed via priority and notifications, not by skipping workflow states.
- Scenario: Single source of truth. GIVEN the transition table, THEN it is the only source governing what is valid; no consumer replicates the rule with independent conditionals.

#### R0.3 — Only `admin_org` can close

Closing (marking as unable to resolve) MUST require the `CLOSE incidents` permission, distinct from the permission to resolve.

- Scenario: Admin can close. GIVEN a user with `CLOSE incidents` permission, THEN they can close an incident and provide a reason.
- Scenario: Operator cannot close. GIVEN an `operador_org` with `UPDATE incidents` but without `CLOSE incidents` permission, WHEN they attempt to close, THEN the response is 403.
- Scenario: Operator can resolve. GIVEN the same `operador_org`, WHEN they resolve an incident assigned to them, THEN the transition is accepted: resolution does not require `CLOSE`.
- Scenario: Permission propagated. GIVEN the migration is applied, THEN `CLOSE incidents` exists in `roles.permissions` and in `users.permissions` for all existing `master` and `admin_org` users, and `perm:v3:uid:*` is invalidated.

#### R0.4 — Close without resolution requires a reason

Closing an incident that could not be resolved MUST record why.

- Scenario: Reason mandatory. GIVEN a transition to `closed` without a reason, THEN the request fails with 422.
- Scenario: Reason persisted. GIVEN a transition to `closed` with a reason, THEN the text is associated with the incident and visible in its history.
- Scenario: Resolution doesn't require reason. GIVEN a transition to `resolved`, THEN no reason is requested: success is self-explanatory.

#### R0.5 — All transitions recorded in history

Each state change MUST be recorded with who changed it and when.

- Scenario: Transition recorded. GIVEN any accepted transition, THEN an entry is added to the history with the prior state, new state, actor, and timestamp.
- Scenario: Failed transition not recorded. GIVEN an invalid transition, THEN nothing is written to history: a failed attempt is not a change.

#### R0.6 — Reconciliation with approval workflow

The approval flow from T5.6 MUST continue operating under the unified semantics.

- Scenario: Approval remains coherent. GIVEN `incident-approval.service.ts` operating after this change, THEN its behavior corresponds to the declared semantics and does not depend on `closed` meaning "archived after resolution".
- Scenario: No regression. GIVEN the existing approval flow tests, THEN they either continue passing or their changes are justified in writing.

### R1 — Claim

The system MUST allow an authenticated operator (role = `operador_organizacion` or
`operador_sistema`) with `CLAIM incidents` permission to claim an unclaimed incident belonging to
their organization by setting `incidents.claimed_by = operator.id`.

The system MUST reject a claim (409) when `incidents.claimed_by IS NOT NULL`.

The system MUST reject a claim (403) when the incident's `organization_id` does not match the
operator's `organization_id`, UNLESS the caller is `admin_sistema`.

The system MUST reject a claim (429) when the operator's active claim count (`WHERE claimed_by = operator.id AND status = 'in_progress'`) equals or exceeds `organizations.max_active_claims`.

The claim operation MUST be atomic: `UPDATE incidents SET claimed_by = :id WHERE id = :incidentId AND claimed_by IS NULL RETURNING *` — 0 rows returned means 409, not a separate SELECT-then-UPDATE.

### R2 — Release

The system MUST allow the operator who currently holds `claimed_by` to release by setting
`claimed_by = NULL`.

The system MUST reject a release (403) when `incidents.claimed_by != caller.id`.

### R3 — Available Operators

The system MUST return a list of operators in the incident's organization whose active claim count
is strictly less than `organizations.max_active_claims`. Only users with operator roles are included.

The list MUST NOT include the operator currently holding `claimed_by` (they are already assigned).

### R4 — Status Catalog

The system MUST return all values of the `IncidentStatus` enum without requiring any specific
permission (JWT required, no RBAC gate).

Response shape: `{statuses: ["pending", "in_progress", "resolved"]}`.

## Scenarios

### POST /api/incidents/:id/claim

**Scenario 1: Operator successfully claims an unclaimed incident**
```
Given an authenticated operator with role operador_organizacion and permission CLAIM incidents
  And an incident with organization_id = operator.organization_id and claimed_by = NULL
When the operator sends POST /api/incidents/:id/claim
Then the response status is 200
  And the response body includes the incident with claimed_by = operator.id
  And incidents.claimed_by in the database is set to operator.id
```

**Scenario 2: Claim fails when incident already claimed by another operator**
```
Given an authenticated operator A with CLAIM incidents permission
  And an incident already claimed by operator B (claimed_by = B.id)
When operator A sends POST /api/incidents/:id/claim
Then the response status is 409
  And the response body contains error code INCIDENT_ALREADY_CLAIMED
  And incidents.claimed_by remains B.id in the database
```

**Scenario 3: Claim fails when operator belongs to a different organization**
```
Given an authenticated operator with organization_id = org-A
  And an incident with organization_id = org-B and claimed_by = NULL
When the operator sends POST /api/incidents/:id/claim
Then the response status is 403
```

**Scenario 4: Claim fails when operator is at max_active_claims limit**
```
Given an organization with max_active_claims = 3
  And an operator with 3 incidents already in_progress and claimed_by = operator.id
  And a new unclaimed incident in that organization
When the operator sends POST /api/incidents/:id/claim
Then the response status is 429
  And the response body contains error code CLAIM_LIMIT_REACHED
```

**Scenario 5: Unauthenticated claim returns 401**
```
Given no Authorization header
When a request is sent to POST /api/incidents/:id/claim
Then the response status is 401
```

### POST /api/incidents/:id/release

**Scenario 1: Owner successfully releases their claim**
```
Given an authenticated operator with claimed_by = operator.id on the incident
When the operator sends POST /api/incidents/:id/release
Then the response status is 200
  And the response body includes the incident with claimed_by = null
  And incidents.claimed_by in the database is NULL
```

**Scenario 2: Release fails when caller is not the claimer**
```
Given an incident claimed by operator A (claimed_by = A.id)
When operator B sends POST /api/incidents/:id/release
Then the response status is 403
  And incidents.claimed_by remains A.id
```

**Scenario 3: Release on unclaimed incident returns 409**
```
Given an incident with claimed_by = NULL
When an operator sends POST /api/incidents/:id/release
Then the response status is 409
  And the response body contains error code INCIDENT_NOT_CLAIMED
```

### GET /api/incidents/:id/available-operators

**Scenario 1: Returns operators under claim limit in same org**
```
Given an incident with organization_id = org-X and max_active_claims = 5
  And operator A in org-X with 2 active claims
  And operator B in org-X with 5 active claims (at limit)
  And operator C in org-Y (different org)
When an admin sends GET /api/incidents/:id/available-operators
Then the response status is 200
  And the response includes operator A
  And the response does NOT include operator B (at limit)
  And the response does NOT include operator C (different org)
```

**Scenario 2: Returns empty array when no eligible operators exist**
```
Given all operators in the incident's org are at the claim limit
When GET /api/incidents/:id/available-operators is called
Then the response status is 200
  And the response body is {operators: []}
```

### GET /api/incidents/statuses

**Scenario 1: Returns all status values for authenticated user**
```
Given any authenticated user (any role)
When GET /api/incidents/statuses is called
Then the response status is 200
  And the response body is {statuses: ["pending", "in_progress", "resolved", "closed"]}
```

**Scenario 2: Returns 401 for unauthenticated request**
```
Given no Authorization header
When GET /api/incidents/statuses is called
Then the response status is 401
```
