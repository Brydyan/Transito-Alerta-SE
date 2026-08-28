import { StorageConfig } from '../../config/storage.config';
import { IStorageClient } from './storage-client.interface';
import { NoopStorageClient } from './noop-storage.client';
import { SupabaseStorageClient } from './supabase-storage.client';

/**
 * Pure selection function (SC-209 D1) — extracted from `StorageModule`'s DI
 * factory so it is testable with real objects and zero NestJS/Supabase SDK
 * mocks. `STORAGE_PROVIDER=supabase` throws loudly on missing creds rather
 * than silently degrading to noop (a misconfigured prod deploy must fail
 * fast, not quietly write to local disk).
 */
export function resolveStorageClient(conf: StorageConfig): IStorageClient {
  return conf.provider === 'supabase' ? new SupabaseStorageClient(conf) : new NoopStorageClient();
}
