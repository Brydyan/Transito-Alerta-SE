import type { IncidentStatus } from '../../entities/incident.entity';
export declare const TRANSITIONS: Readonly<Record<IncidentStatus, readonly IncidentStatus[]>>;
export declare const ALLOWED_STATUSES: ReadonlyArray<IncidentStatus>;
export declare function canTransition(from: IncidentStatus, to: IncidentStatus): boolean;
