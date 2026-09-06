// T5.1 — error codes for the incident workflow domain.
// Each constant is a string the controller surfaces as a 4xx body key, so
// clients can switch on the code (e.g. "INCIDENT_ALREADY_CLAIMED") rather
// than parsing human-readable messages.

export const INCIDENT_ALREADY_CLAIMED = 'INCIDENT_ALREADY_CLAIMED';
export const INCIDENT_NOT_CLAIMED = 'INCIDENT_NOT_CLAIMED';
export const WRONG_ORGANIZATION = 'WRONG_ORGANIZATION';
export const CLAIM_LIMIT_REACHED = 'CLAIM_LIMIT_REACHED';
export const NOT_THE_CLAIMER = 'NOT_THE_CLAIMER';
// sc-315 — emitted by IncidentWorkflowService.changeStatus() when the
// requested `from -> to` transition is not declared in the state machine.
export const INCIDENT_INVALID_TRANSITION = 'INCIDENT_INVALID_TRANSITION';
