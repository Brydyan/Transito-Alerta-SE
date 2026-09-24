import { IStorageClient, StorageUploadResult } from './storage-client.interface';
export declare class NoopStorageClient implements IStorageClient {
    private readonly rootDir;
    constructor(rootDir?: string);
    upload(key: string, buffer: Buffer, _mimetype: string): Promise<StorageUploadResult>;
    getSignedUrl(key: string): Promise<string>;
    delete(key: string): Promise<void>;
    private resolvePath;
    private toFileUrl;
}
