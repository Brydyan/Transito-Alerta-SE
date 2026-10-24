import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageConfig } from '../../config/storage.config';
import { STORAGE_CLIENT } from './storage-client.interface';
import { resolveStorageClient } from './storage-provider.factory';

/**
 * StorageModule (SC-209 Phase A, D1) — binds STORAGE_CLIENT to
 * SupabaseStorageClient or NoopStorageClient depending on `STORAGE_PROVIDER`
 * (config `storage` namespace, `storage.config.ts`). `ConfigModule` is
 * global (`CoreModule`) so no local import is needed here.
 * Imported by CommentsModule + UsersModule.
 */
@Module({
  providers: [
    {
      provide: STORAGE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => resolveStorageClient(config.get<StorageConfig>('storage')!),
    },
  ],
  exports: [STORAGE_CLIENT],
})
export class StorageModule {}
