import { Repository } from 'typeorm';
import { IncidentImageEntity } from '../../entities/incident-image.entity';
import { IncidentImageStorageService, MulterFile } from './incident-image-storage.service';
import { IncidentImageDto } from './dto/incident-image.dto';
import { IncidentsRepository } from './incidents.repository';
import { PermissionLookupService } from '../../common/permissions/permission-lookup.service';
export declare class IncidentImagesService {
    private readonly imageRepo;
    private readonly storage;
    private readonly incidentsRepository;
    private readonly permissionLookup;
    private readonly logger;
    constructor(imageRepo: Repository<IncidentImageEntity>, storage: IncidentImageStorageService, incidentsRepository: IncidentsRepository, permissionLookup: PermissionLookupService);
    attachToIncident(incidentId: string, callerId: string, callerPermissions: string[], files: MulterFile[]): Promise<IncidentImageDto[]>;
    removeFromIncident(incidentId: string, imageId: string, callerId: string, callerPermissions: string[]): Promise<void>;
}
