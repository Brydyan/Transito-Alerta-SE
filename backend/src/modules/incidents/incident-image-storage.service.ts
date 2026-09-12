import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ImageCompressionService } from '../../core/image/image-compression.service';
import {
  IStorageClient,
  STORAGE_CLIENT,
} from '../../core/storage/storage-client.interface';
import {
  MulterFile,
  UploadResult,
} from '../comments/comment-image-storage.service';

export { MulterFile, UploadResult };

/**
 * IncidentImageStorageService (T6.6.B) — multipart upload → S3 → signed URL.
 * Mirrors CommentImageStorageService pattern exactly.
 *
 * F7 image-compression-webp (T4.1) — `upload()` now delegates to
 * `ImageCompressionService` with `type='incident'` (300KB cap) before
 * persisting the WebP result via the injected `IStorageClient` (Supabase
 * in prod, noop locally — design D1).
 *
 * Pre-F7 the service held its own SHA-256 stub for `getSignedUrl` and a
 * no-op for `delete`; those are now uniformly delegated to the storage
 * client to keep this service aligned with `CommentImageStorageService`.
 * Key convention: `incidents/{incidentId}/{uuid}.webp` (extension is
 * `.webp` always — original filename is dropped, sanitization is moot).
 */
@Injectable()
export class IncidentImageStorageService {
  constructor(
    private readonly imageCompression: ImageCompressionService,
    @Inject(STORAGE_CLIENT) private readonly client: IStorageClient,
  ) {}

  async upload(incidentId: string, file: MulterFile): Promise<UploadResult> {
    const { buffer: webpBuffer } = await this.imageCompression.compress(
      file.buffer ?? Buffer.alloc(0),
      'incident',
      file.mimetype,
    );

    const key = `incidents/${incidentId}/${randomUUID()}.webp`;
    return this.client.upload(key, webpBuffer, 'image/webp');
  }

  getSignedUrl(key: string): Promise<string> {
    return this.client.getSignedUrl(key);
  }

  delete(key: string): Promise<void> {
    return this.client.delete(key);
  }
}
