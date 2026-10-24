import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ImageCompressionService } from '../../infra/image/image-compression.service';
import {
  IStorageClient,
  STORAGE_CLIENT,
} from '../../infra/storage/storage-client.interface';
import { MulterFile, UploadResult } from '../comments/comment-image-storage.service';

export { MulterFile, UploadResult };

/**
 * IncidentImageStorageService (F7 — WebP Image Compression, T4.1, apply
 * D2) — multipart upload → ImageCompressionService.compress() →
 * IStorageClient. Pre-F7 this service held its own SHA-256 stub for
 * `getSignedUrl` and a no-op `delete`; both are now delegated to the
 * injected IStorageClient so the service is structurally identical to
 * `CommentImageStorageService` (design D1 / D2). The stub was a footgun:
 * a controller could pick `https://storage.example.com/{key}?sig={hex}`
 * over the real Supabase URL.
 *
 * Storage key: `incidents/{incidentId}/{uuid}.webp` (was
 * `{uuid}-{sanitizedOriginalname}` — the F7 compression replaces the
 * original file extension with `.webp` because the saved bytes are
 * always WebP, R8).
 */
@Injectable()
export class IncidentImageStorageService {
  constructor(
    @Inject(STORAGE_CLIENT) private readonly client: IStorageClient,
    private readonly imageCompression: ImageCompressionService,
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
