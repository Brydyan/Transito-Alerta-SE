# Incident Tracking Panel Specification

## Purpose

Seguimiento side panel that surfaces incident summary, assigned operator, and
two live elapsed timers for supervisory monitoring without navigating to the
detail page.

## Requirements

### Requirement: Panel Open and Close

The tracking panel MUST open when the user selects "Seguimiento" from a row's
actions dropdown. It MUST close when the user clicks the X button or presses
Escape. It MUST NOT navigate away from the incidents list.

#### Scenario: Panel opens from row action

- GIVEN an authorized user on the incidents list
- WHEN the user selects "Seguimiento" from a row's actions dropdown
- THEN the tracking panel slides open for that incident without a page navigation

#### Scenario: Panel closes with X button

- GIVEN the tracking panel is open
- WHEN the user clicks the X button
- THEN the panel closes and the incidents list remains visible

#### Scenario: Panel closes on Escape key

- GIVEN the tracking panel is open and focus is anywhere on the page
- WHEN the user presses Escape
- THEN the panel closes

### Requirement: Incident Summary Display

The panel MUST display the incident's title, description, priority, and
location (text address or coordinates).

#### Scenario: Summary fields render

- GIVEN the tracking panel opens for an incident with all fields populated
- WHEN the panel loads
- THEN title, description, priority badge, and location are all visible

#### Scenario: Missing location

- GIVEN an incident has no location data
- WHEN the panel renders
- THEN the location field shows "Sin ubicación" instead of a blank

### Requirement: Assignment Information Display

The panel MUST show the assigned operator's full name if the incident is
assigned, or "No asignado" if it is not. When assigned, the panel MUST show
the assignment date/time sourced from `assignments.created_at`.

#### Scenario: Assigned incident shows operator name and date

- GIVEN an incident assigned to an operator with assignment created_at = T
- WHEN the tracking panel opens
- THEN the operator's full name and the formatted datetime T are displayed

#### Scenario: Unassigned incident shows placeholder

- GIVEN an incident with no assignment record (claimed_by IS NULL)
- WHEN the tracking panel opens
- THEN "No asignado" is displayed in the operator field

### Requirement: Live Elapsed Timers

The panel MUST display two independent elapsed timers that tick every second:

- **Timer 1 — "Tiempo desde creación"**: elapsed time since `incident.created_at`.
- **Timer 2 — "Tiempo desde asignación"**: elapsed time since `assignments.created_at`.
  If the incident is not assigned, Timer 2 MUST display "--:--".

Both timers MUST stop and all intervals MUST be cleared when the panel is
destroyed or closed (no memory leaks).

#### Scenario: Both timers tick when incident is assigned

- GIVEN the tracking panel is open for an assigned incident
- WHEN 3 seconds elapse
- THEN Timer 1 and Timer 2 each advance by 3 seconds

#### Scenario: Timer 2 shows placeholder when unassigned

- GIVEN the tracking panel opens for an unassigned incident
- WHEN the panel renders
- THEN Timer 2 displays "--:--" and does not tick

#### Scenario: Timers stop on panel close

- GIVEN the tracking panel is open with both timers running
- WHEN the panel is closed
- THEN all setInterval handles are cleared and no timer callbacks fire after close

#### Scenario: Timer 1 format for long durations

- GIVEN an incident created more than 1 hour ago
- WHEN Timer 1 renders
- THEN the display uses HH:MM:SS format (e.g. "01:23:45")
