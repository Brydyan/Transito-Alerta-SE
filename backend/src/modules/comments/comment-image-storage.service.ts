import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';

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
 * CommentImageStorageService (T5.5) — multipart upload → S3 → signed URL.
 * Same SHA-256 placeholder pattern as AvatarStorageService (T2.3).
 * Key convention: `comments/{commentId}/{uuid}-{sanitizedOriginalname}`.
 */
@Injectable()
export class CommentImageStorageService {
  async upload(commentId: string, file: MulterFile): Promise<UploadResult> {
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `comments/${commentId}/${randomUUID()}-${sanitized}`;
    return { key, url: this.getSignedUrl(key) };
  }

  getSignedUrl(key: string): string {
    const signature = createHash('sha256').update(key).digest('hex').slice(0, 16);
    return `https://storage.example.com/${key}?sig=${signature}`;
  }

  async delete(_key: string): Promise<void> {
    // no-op stub; real S3 DeleteObjectCommand plugs in here
  }
}
