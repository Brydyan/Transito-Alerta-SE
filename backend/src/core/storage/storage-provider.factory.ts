import { StorageConfig } from '../../config/storage.config';
import { MinioStorageClient } from './minio-storage.client';
import { IStorageClient } from './storage-client.interface';
import { NoopStorageClient } from './noop-storage.client';
import { SupabaseStorageClient } from './supabase-storage.client';

/**
 * Pure selection function (SC-209 D1, extended by
 * infra/2026-10-07-minio-object-storage) — extracted from `StorageModule`'s
 * DI factory so it is testable with real objects and zero NestJS/SDK mocks.
 *
 * `STORAGE_PROVIDER=supabase` and `STORAGE_PROVIDER=minio` both throw
 * loudly on missing creds rather than silently degrading to noop — a
 * misconfigured prod or staging deploy must fail fast, not quietly write
 * to local disk.
 */
export function resolveStorageClient(conf: StorageConfig): IStorageClient {
  switch (conf.provider) {
    case 'supabase':
      return new SupabaseStorageClient(conf);
    case 'minio':
      return new MinioStorageClient(conf);
    case 'noop':
    default:
      return new NoopStorageClient();
  }
}
