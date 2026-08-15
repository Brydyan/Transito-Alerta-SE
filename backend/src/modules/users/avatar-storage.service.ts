import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

/**
 * AvatarStorageService (T2.3) — multipart upload -> S3 -> signed URL.
 *
 * NOTE: this is a thin, swappable abstraction, not the AWS SDK — pulling in
 * @aws-sdk/client-s3 was out of scope for this batch (not in the explicit
 * dependency list). `upload()` is the seam a real S3 client plugs into;
 * tests mock this whole service, so nothing here ever makes a live call.
 * Object key convention: `avatars/{userId}/{uuid}-{originalname}`.
 */
@Injectable()
export class AvatarStorageService {
  async upload(userId: string, file: UploadedFile): Promise<string> {
    const key = `avatars/${userId}/${randomUUID()}-${file.originalname}`;
    return this.getSignedUrl(key);
  }

  /**
   * Deterministic placeholder "signed" URL (real impl: S3
   * getSignedUrl/pre-signed PUT/GET). Kept pure/side-effect-free so it is
   * trivially testable without network access.
   */
  getSignedUrl(key: string): string {
    const signature = createHash('sha256').update(key).digest('hex').slice(0, 16);
    return `https://storage.example.com/${key}?sig=${signature}`;
  }
}
