import { IStorageClient } from '../../core/storage/storage-client.interface';
export interface MulterFile {
    originalname: string;
    mimetype: string;
    size: number;
    fieldname: string;
    encoding: string;
    buffer?: Buffer;
}
export interface UploadResult {
    key: string;
    url: string;
}
export declare class CommentImageStorageService {
    private readonly client;
    constructor(client: IStorageClient);
    upload(commentId: string, file: MulterFile): Promise<UploadResult>;
    getSignedUrl(key: string): Promise<string>;
    delete(key: string): Promise<void>;
}
