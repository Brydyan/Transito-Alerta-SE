import { StorageConfig } from '../../config/storage.config';
import { IStorageClient, StorageUploadResult } from './storage-client.interface';
export declare class SupabaseStorageClient implements IStorageClient {
    private readonly client;
    private readonly bucket;
    constructor(conf: StorageConfig);
    upload(key: string, buffer: Buffer, mimetype: string): Promise<StorageUploadResult>;
    getSignedUrl(key: string): Promise<string>;
    delete(key: string): Promise<void>;
}
