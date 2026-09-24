import { DataSource, EntityManager } from 'typeorm';
import { IncidentPriority, IncidentStatus } from '../../entities/incident.entity';
import { SubjectScope } from '../../common/authz/subject-scope';
export interface IncidentRow {
    id: string;
    title: string;
    description: string | null;
    status: IncidentStatus;
    priority: IncidentPriority;
    citizen_id: string;
    is_anonymous: boolean;
    assigned_to: string | null;
    zone_id: string | null;
    geofence_matched: boolean;
    organization_id: string | null;
    category_id: string | null;
    claimed_by: string | null;
    approved_by: string | null;
    approved_at: Date | null;
    rejected_by: string | null;
    rejected_at: Date | null;
    rejection_reason: string | null;
    closed_reason: string | null;
    lat: number;
    lng: number;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
    claimed_at: Date | null;
    resolution_date: Date | null;
    follower_count: number;
    corroboration_count: number;
    is_followed_by_me: boolean;
    is_corroborated_by_me: boolean;
}
export interface CreateIncidentInput {
    title: string;
    description: string | null;
    lat: number;
    lng: number;
    priority: IncidentPriority;
    citizenId: string;
    zoneId: string | null;
    geofenceMatched: boolean;
    organizationId: string | null;
    categoryId?: string | null;
    isAnonymous: boolean;
}
export declare const getSelectColumns: (actorId?: string) => string;
export declare class IncidentsRepository {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    create(input: CreateIncidentInput, manager?: EntityManager): Promise<IncidentRow>;
    findAll(filters: {
        zoneId?: string;
        status?: IncidentStatus;
    }, scope: SubjectScope, actorId?: string): Promise<IncidentRow[]>;
    findOne(id: string, scope: SubjectScope, actorId?: string): Promise<IncidentRow | null>;
    update(id: string, values: {
        title: string;
        description: string | null;
        categoryId: string | null;
    }, actorId?: string): Promise<IncidentRow>;
    softDelete(id: string): Promise<void>;
}
export declare function unwrapReturningRows<T>(result: unknown): T[];
