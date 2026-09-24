import { IStorageClient } from '../../core/storage/storage-client.interface';
export interface UploadedFile {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
}
export declare class AvatarStorageService {
    private readonly client;
    constructor(client: IStorageClient);
    upload(userId: string, file: UploadedFile): Promise<string>;
    getSignedUrl(key: string): Promise<string>;
}
