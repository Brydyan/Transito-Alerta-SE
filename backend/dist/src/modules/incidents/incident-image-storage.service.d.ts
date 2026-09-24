import { MulterFile, UploadResult } from '../comments/comment-image-storage.service';
export { MulterFile, UploadResult };
export declare class IncidentImageStorageService {
    constructor();
    upload(incidentId: string, file: MulterFile): Promise<UploadResult>;
    getSignedUrl(key: string): string;
    delete(_key: string): Promise<void>;
}
