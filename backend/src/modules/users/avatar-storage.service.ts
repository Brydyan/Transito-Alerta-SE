import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ImageCompressionService } from '../../infra/image/image-compression.service';
import {
  IStorageClient,
  STORAGE_CLIENT,
} from '../../infra/storage/storage-client.interface';

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

/**
 * AvatarStorageService (F7 — WebP Image Compression, T3.1) — multipart
 * upload → ImageCompressionService.compress() → IStorageClient (Supabase in
 * prod, NoopStorageClient locally) → signed URL. The pre-F7 path stored
 * the original bytes verbatim; F7 compresses to WebP at quality 45, keeps
 * only the WebP buffer (R8: `image/webp` MIME), and rewrites the storage
 * key from `{uuid}-{originalname}` to `{uuid}.webp` so the saved object
 * extension matches its real format.
 *
 * Errors from `imageCompression.compress()` (R4 FileTooLarge, R5
 * UnsupportedMimeType, R1 CompressionSizeExceeded, R6 CompressionFailed)
 * bubble up to the HTTP layer unchanged; the exception classes are
 * NestJS-standard so the right status code (400/415/422) is returned
 * without the service knowing about HTTP.
 */
@Injectable()
export class AvatarStorageService {
  constructor(
    @Inject(STORAGE_CLIENT) private readonly client: IStorageClient,
    private readonly imageCompression: ImageCompressionService,
  ) {}

  async upload(userId: string, file: UploadedFile): Promise<string> {
    const { buffer: webpBuffer } = await this.imageCompression.compress(
      file.buffer,
      'avatar',
      file.mimetype,
    );

    const key = `avatars/${userId}/${randomUUID()}.webp`;
    const { url } = await this.client.upload(key, webpBuffer, 'image/webp');
    return url;
  }

  getSignedUrl(key: string): Promise<string> {
    return this.client.getSignedUrl(key);
  }
}
