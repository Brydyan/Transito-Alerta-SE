import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ImageCompressionService } from '../../core/image/image-compression.service';
import {
  IStorageClient,
  STORAGE_CLIENT,
} from '../../core/storage/storage-client.interface';

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

/**
 * CommentImageStorageService (T5.5, SC-209 Phase A real impl) — multipart
 * upload -> IStorageClient (Supabase in prod, noop locally, D1) -> signed
 * URL. The SHA-256 placeholder is gone; key generation stays here (design
 * D2 — only the placeholder lines changed), byte persistence + URL
 * resolution is delegated to the injected client.
 *
 * F7 (image-compression-webp, T5.1) — `upload()` now delegates to
 * `ImageCompressionService.compress()` with `type='comment'` (300KB cap)
 * before persisting. The original filename is no longer interpolated
 * into the key — the key is `comments/{commentId}/{uuid}.webp`.
 */
@Injectable()
export class CommentImageStorageService {
  constructor(
    @Inject(STORAGE_CLIENT) private readonly client: IStorageClient,
    private readonly imageCompression: ImageCompressionService,
  ) {}

  async upload(commentId: string, file: MulterFile): Promise<UploadResult> {
    const { buffer: webpBuffer } = await this.imageCompression.compress(
      file.buffer ?? Buffer.alloc(0),
      'comment',
      file.mimetype,
    );

    const key = `comments/${commentId}/${randomUUID()}.webp`;
    return this.client.upload(key, webpBuffer, 'image/webp');
  }

  getSignedUrl(key: string): Promise<string> {
    return this.client.getSignedUrl(key);
  }

  delete(key: string): Promise<void> {
    return this.client.delete(key);
  }
}
