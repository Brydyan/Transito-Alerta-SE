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
 * CommentImageStorageService (F7 — WebP Image Compression, T5.1) —
 * multipart upload → ImageCompressionService.compress() → IStorageClient.
 * F7 wiring mirrors AvatarStorageService (quality 60, .webp key,
 * image/webp MIME). Pre-F7 the service stored the original bytes with
 * key `comments/{commentId}/{uuid}-{originalname}`; F7 stores the
 * compressed WebP with key `comments/{commentId}/{uuid}.webp`.
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
