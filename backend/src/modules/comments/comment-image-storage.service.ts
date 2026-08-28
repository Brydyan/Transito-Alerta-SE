import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { IStorageClient, STORAGE_CLIENT } from '../../core/storage/storage-client.interface';

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
 * Key convention: `comments/{commentId}/{uuid}-{sanitizedOriginalname}`.
 */
@Injectable()
export class CommentImageStorageService {
  constructor(@Inject(STORAGE_CLIENT) private readonly client: IStorageClient) {}

  async upload(commentId: string, file: MulterFile): Promise<UploadResult> {
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `comments/${commentId}/${randomUUID()}-${sanitized}`;
    return this.client.upload(key, file.buffer ?? Buffer.alloc(0), file.mimetype);
  }

  getSignedUrl(key: string): Promise<string> {
    return this.client.getSignedUrl(key);
  }

  delete(key: string): Promise<void> {
    return this.client.delete(key);
  }
}
