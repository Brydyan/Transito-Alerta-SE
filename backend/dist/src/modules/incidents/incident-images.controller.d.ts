import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { IncidentImageDto } from './dto/incident-image.dto';
import { MulterFile } from './incident-image-storage.service';
import { IncidentImagesService } from './incident-images.service';
export declare class IncidentImagesController {
    private readonly incidentImagesService;
    constructor(incidentImagesService: IncidentImagesService);
    attachImages(id: string, files: MulterFile[], req: AuthenticatedRequest): Promise<IncidentImageDto[]>;
    removeImage(id: string, imageId: string, req: AuthenticatedRequest): Promise<void>;
}
