import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { IStorageClient, STORAGE_CLIENT } from '../../core/storage/storage-client.interface';

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
 * to the injected client. No `delete()` here — design D2: the two
 * services' contracts differ, avatars are never explicitly deleted today.
 * Object key convention: `avatars/{userId}/{uuid}-{originalname}`.
 */
@Injectable()
export class AvatarStorageService {
  constructor(@Inject(STORAGE_CLIENT) private readonly client: IStorageClient) {}

  async upload(userId: string, file: UploadedFile): Promise<string> {
    const key = `avatars/${userId}/${randomUUID()}-${file.originalname}`;
    const { url } = await this.client.upload(key, file.buffer, file.mimetype);
    return url;
  }

  getSignedUrl(key: string): Promise<string> {
    return this.client.getSignedUrl(key);
  }
}
