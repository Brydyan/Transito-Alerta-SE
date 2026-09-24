export interface StorageUploadResult {
    key: string;
    url: string;
}
export interface IStorageClient {
    upload(key: string, buffer: Buffer, mimetype: string): Promise<StorageUploadResult>;
    getSignedUrl(key: string): Promise<string>;
    delete(key: string): Promise<void>;
}
export declare const STORAGE_CLIENT = "STORAGE_CLIENT";
