import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ImageCompressionService } from '../../core/image/image-compression.service';
import {
  IStorageClient,
  STORAGE_CLIENT,
} from '../../core/storage/storage-client.interface';

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

/**
 * AvatarStorageService (T2.3, SC-209 Phase A design D2 — avatar follow-up
 * wired in the same batch) — multipart upload -> IStorageClient (Supabase
 * in prod, noop locally, D1) -> signed URL. SHA-256 placeholder removed;
 * key generation stays here, byte persistence + URL resolution delegated
 * to the injected client.
 *
 * F7 (image-compression-webp, T3.1) — `upload()` first delegates the
 * raw buffer to `ImageCompressionService.compress()` (design D2 — service
 * injection over middleware). Only the compressed WebP is persisted; the
 * raw bytes never touch the storage client. Object key convention was
 * `{uuid}-{originalname}` — now it is `{uuid}.webp` so the original
 * filename (which is user-controlled and may contain odd chars) cannot
 * leak into storage paths.
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
