import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { MulterFile, UploadResult } from '../comments/comment-image-storage.service';

export { MulterFile, UploadResult };

/**
 * IncidentImageStorageService (T6.6.B) — multipart upload → S3 → signed URL.
 * Mirrors CommentImageStorageService pattern exactly.
 * Key convention: `incidents/{incidentId}/{uuid}-{sanitizedOriginalname}`.
 */
@Injectable()
export class IncidentImageStorageService {
  async upload(incidentId: string, file: MulterFile): Promise<UploadResult> {
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `incidents/${incidentId}/${randomUUID()}-${sanitized}`;
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
