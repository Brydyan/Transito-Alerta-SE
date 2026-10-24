import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { StorageConfig } from '../../config/storage.config';
import {
  IStorageClient,
  StorageUploadResult,
} from './storage-client.interface';

/**
 * MinioStorageClient (infra/2026-10-07-minio-object-storage) — S3-compatible
 * storage client backed by MinIO for staging & local dev. Uses the official
 * `@aws-sdk/client-s3` SDK (design D2) so the same code path also targets
 * AWS S3 / Cloudflare R2 / Wasabi if/when we migrate.
 *
 * Design D3: the bucket is provisioned with a public-download policy by the
 * `minio-init` container, so `getSignedUrl()` returns a permanent URL
 * (no TTL, no signature) — and `upload()` echoes the same URL the browser
 * will use.
 *
 * Design D5: two endpoints, one internal (`minioEndpoint`, the Docker DNS
 * the backend talks to) and one public (`minioPublicUrl`, what the browser
 * fetches). They almost always differ: the public URL is the nginx proxy
 * `/storage/` (design D4) or a CDN.
 *
 * `delete()` swallows errors (R4 — idempotent). MinIO returns success on
 * NoSuchKey but other transport / auth errors must not break the request
 * that triggered the cleanup; the worst case is a stale object in the
 * bucket, and a future sweeper / lifecycle rule can clean it up.
 */
@Injectable()
export class MinioStorageClient implements IStorageClient {
  private readonly logger = new Logger(MinioStorageClient.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(conf: StorageConfig) {
    if (!conf.minioEndpoint) {
      throw new Error(
        'STORAGE_MINIO_ENDPOINT is required when STORAGE_PROVIDER=minio',
      );
    }
    if (!conf.minioAccessKey) {
      throw new Error(
        'STORAGE_MINIO_ACCESS_KEY is required when STORAGE_PROVIDER=minio',
      );
    }
    if (!conf.minioSecretKey) {
      throw new Error(
        'STORAGE_MINIO_SECRET_KEY is required when STORAGE_PROVIDER=minio',
      );
    }

    this.bucket = conf.minioBucket || 'uploads';
    this.publicUrl = (
      conf.minioPublicUrl || `${conf.minioEndpoint}/${this.bucket}`
    ).replace(/\/+$/, '');

    this.client = new S3Client({
      endpoint: conf.minioEndpoint,
      region: 'us-east-1', // MinIO accepts any region
      credentials: {
        accessKeyId: conf.minioAccessKey,
        secretAccessKey: conf.minioSecretKey,
      },
      forcePathStyle: conf.minioForcePathStyle,
    });
  }

  async upload(
    key: string,
    buffer: Buffer,
    mimetype: string,
  ): Promise<StorageUploadResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
      }),
    );

    const url = `${this.publicUrl}/${key}`;
    return { key, url };
  }

  async getSignedUrl(key: string): Promise<string> {
    // Bucket has a public-download policy (D3). The "signed" URL is just
    // the public URL — no TTL, no signature, no expiry-after-1h surprise.
    return `${this.publicUrl}/${key}`;
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (err) {
      // R4: idempotent. Log and swallow — the next sweep / lifecycle
      // rule can clean any orphan.
      this.logger.warn(
        `MinIO delete failed for key=${key} (swallowed as idempotent): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
