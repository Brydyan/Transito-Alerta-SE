import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Cache } from 'cache-manager';
import type Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { IncidentStatus } from '../../entities/incident.entity';
import { ALL_ZONES_TAG, GeofencingService } from '../geofencing/geofencing.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { SubjectScope } from '../../common/authz/subject-scope';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { IncidentRow, IncidentsRepository } from './incidents.repository';
export declare const INCIDENTS_STREAM_KEY = "incidents:events";
export { ALL_ZONES_TAG };
export declare class IncidentsService {
    private readonly incidentsRepository;
    private readonly geofencingService;
    private readonly organizationsService;
    private readonly eventEmitter;
    private readonly redis;
    private readonly cache;
    private readonly dataSource;
    private readonly configService;
    constructor(incidentsRepository: IncidentsRepository, geofencingService: GeofencingService, organizationsService: OrganizationsService, eventEmitter: EventEmitter2, redis: Redis, cache: Cache, dataSource: DataSource, configService: ConfigService);
    create(dto: CreateIncidentDto, citizenId: string): Promise<IncidentRow>;
    private resolveMaskUserId;
    findAll(filters: {
        zoneId?: string;
        status?: IncidentStatus;
    }, scope: SubjectScope, actorId?: string): Promise<IncidentRow[]>;
    findOne(id: string, scope: SubjectScope, actorId?: string): Promise<IncidentRow>;
    private publish;
    private listCacheKey;
    private purgeListCaches;
    update(id: string, dto: {
        title?: string;
        description?: string;
        categoryId?: string | null;
    }): Promise<IncidentRow>;
    softDelete(id: string): Promise<void>;
    getStatuses(): {
        id: IncidentStatus;
        label: string;
    }[];
}
