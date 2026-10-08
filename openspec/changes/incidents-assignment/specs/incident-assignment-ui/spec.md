# Incident Assignment UI Specification

## Purpose

Two-panel assignment modal and bulk toolbar action that let supervisory roles
assign unassigned incidents to `operador_org` users from the incidents list.

## Requirements

### Requirement: Assignment Toolbar Button

The incidents list toolbar MUST render an "Asignar" button only when the
authenticated user holds the `ASSIGN assignments` permission (roles: master,
operador_sistema, admin_org). All other roles MUST NOT see the button.

#### Scenario: Authorized role sees toolbar button

- GIVEN a user with the `ASSIGN assignments` permission is on the incidents list
- WHEN the list renders
- THEN the "Asignar" button is visible in the toolbar

#### Scenario: Unauthorized role does not see toolbar button

- GIVEN a user without the `ASSIGN assignments` permission (e.g. operador_org, reporter)
- WHEN the list renders
- THEN the "Asignar" button is absent from the toolbar

#### Scenario: Toolbar button opens assignment modal

- GIVEN an authorized user on the incidents list
- WHEN the user clicks the toolbar "Asignar" button
- THEN the assignment modal opens with both panels in their default state

### Requirement: Operator Panel (Left)

The left panel of the assignment modal MUST list all `operador_org` users
belonging to the scoped organization. Each entry MUST display the operator's
`first_name + last_name` and their current active assignment count (non-soft-deleted
assignments only). The list MUST be sortable by assignment count ascending to
support load balancing.

#### Scenario: Operators listed with workload count

- GIVEN the assignment modal is open and the org has operador_org users
- WHEN the left panel loads
- THEN each operator row shows full name and active assignment count

#### Scenario: Assignment count reflects only active assignments

- GIVEN an operator has 3 assignments, 1 of which is soft-deleted
- WHEN their row renders
- THEN the displayed count is 2

#### Scenario: Sort by assignment count ascending

- GIVEN operators with counts [3, 0, 1]
- WHEN the user sorts by count ascending
- THEN the order becomes [0, 1, 3]

#### Scenario: No operador_org users in org

- GIVEN the organization has no operador_org users
- WHEN the left panel loads
- THEN a "No hay operadores disponibles" empty state is shown and the "Asignar" button in the modal is disabled

### Requirement: Unassigned Incidents Panel (Right)

The right panel MUST list incidents whose `status` is not `in_progress` AND
whose `claimed_by` is NULL. Selecting an operator in the left panel MUST NOT
auto-filter the right panel; the user independently selects incidents.
Multi-select MUST be supported.

#### Scenario: Right panel shows only unassigned incidents

- GIVEN incidents with mixed statuses and claimed_by states
- WHEN the right panel loads
- THEN only incidents with status != in_progress AND claimed_by IS NULL are shown

#### Scenario: Selecting operator does not filter right panel

- GIVEN the right panel shows 5 unassigned incidents
- WHEN the user selects an operator in the left panel
- THEN the right panel list remains unchanged (all 5 still visible)

#### Scenario: Multi-select incidents

- GIVEN the right panel has multiple unassigned incidents
- WHEN the user selects 3 of them
- THEN all 3 are marked as selected and the modal "Asignar" button shows count "Asignar (3)"

#### Scenario: No unassigned incidents

- GIVEN all incidents are either in_progress or claimed
- WHEN the right panel loads
- THEN a "No hay incidencias sin asignar" empty state is shown

#### Scenario: Per-row modal pre-selects incident

- GIVEN a user opens the modal from a specific row's "Asignar" action
- WHEN the modal opens
- THEN that incident is pre-selected in the right panel

### Requirement: Assignment Submission

The modal "Asignar" button MUST submit one POST /assignments request per
selected incident, targeting the selected operator. A 409 Conflict response
MUST be caught, displayed to the user with a refresh offer, and must not crash
the modal. On full success, a toast MUST show the count of assigned incidents
and the modal MUST close.

#### Scenario: Successful assignment of multiple incidents

- GIVEN an operator is selected and 3 incidents are selected
- WHEN the user clicks "Asignar" in the modal
- THEN 3 POST /assignments requests are sent, a toast shows "3 incidencias asignadas", and the modal closes

#### Scenario: 409 Conflict on concurrent assignment

- GIVEN another supervisor already assigned one of the selected incidents
- WHEN POST /assignments returns 409 for that incident
- THEN the modal shows an inline error "Incidencia ya asignada. ¿Actualizar lista?" with a refresh action, and does not close

#### Scenario: 403 Forbidden from backend

- GIVEN a user whose session lost ASSIGN permission between page load and submission
- WHEN POST /assignments returns 403
- THEN a toast error is shown and the modal stays open

### Requirement: Modal State Reset

The assignment modal MUST reset all selections (operator and incidents) each
time it is opened.

#### Scenario: Modal state resets on reopen

- GIVEN the user previously selected an operator and 2 incidents, then closed the modal
- WHEN the user opens the modal again
- THEN no operator is selected and no incidents are pre-selected (unless opened from a row action)
