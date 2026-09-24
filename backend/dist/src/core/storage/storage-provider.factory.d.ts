import { StorageConfig } from '../../config/storage.config';
import { IStorageClient } from './storage-client.interface';
export declare function resolveStorageClient(conf: StorageConfig): IStorageClient;
