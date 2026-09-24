import { EventEmitter2 } from '@nestjs/event-emitter';
import type Redis from 'ioredis';
import { DataSource, Repository } from 'typeorm';
import { GeofencingService } from '../geofencing/geofencing.service';
import { OrganizationEntity } from '../../entities/organization.entity';
import { IncidentStatus } from '../../entities/incident.entity';
import { IncidentRow } from './incidents.repository';
import { AvailableOperatorDto } from './dto/available-operator.dto';
import { ClaimReleaseResponseDto } from './dto/claim-release-response.dto';
interface OperatorUser {
    id: string;
    organizationId: string | null;
    role: string | null;
}
export declare class IncidentWorkflowService {
    private readonly dataSource;
    private readonly orgRepo;
    private readonly geofencingService;
    private readonly eventEmitter;
    private readonly redis;
    constructor(dataSource: DataSource, orgRepo: Repository<OrganizationEntity>, geofencingService: GeofencingService, eventEmitter: EventEmitter2, redis: Redis);
    claim(incidentId: string, operator: OperatorUser): Promise<ClaimReleaseResponseDto>;
    release(incidentId: string, operator: OperatorUser): Promise<ClaimReleaseResponseDto>;
    availableOperators(incidentId: string): Promise<AvailableOperatorDto[]>;
    getStatuses(): IncidentStatus[];
    canTransition(from: IncidentStatus, to: IncidentStatus): boolean;
    changeStatus(args: {
        incidentId: string;
        to: IncidentStatus;
        actorId: string;
        actorPermissions: ReadonlyArray<string>;
        closedReason?: string;
    }): Promise<IncidentRow>;
    private purgeListCaches;
    private publish;
    private loadIncident;
    private maxActiveClaimsFor;
    private activeClaimCountFor;
    private toResponse;
}
export {};
